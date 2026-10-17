//+------------------------------------------------------------------+
//|                                                 KeystoneSync.mq5 |
//|                                                                  |
//| READ-ONLY. Reports this account's balance, equity and deals to   |
//| Keystone Monitor. It never opens, changes or closes a trade:     |
//| there is no trading code in this file at all, and a test in the  |
//| repository fails if any is ever added.                           |
//|                                                                  |
//| Setup (once per terminal):                                       |
//| 1. File -> Open Data Folder, then copy this file into            |
//|    MQL5/Experts. Open it in MetaEditor and press Compile.        |
//| 2. Tools -> Options -> Expert Advisors: tick "Allow WebRequest   |
//|    for listed URL" and add the site's address, origin only:      |
//|    https://keystone-monitor.vercel.app                           |
//| 3. Drag KeystoneSync onto ONE chart of the account. Paste        |
//|    SyncUrl and SyncKey from the admin screen into its inputs.    |
//| 4. The chart's top-left corner shows the last sync result.       |
//|                                                                  |
//| It can run beside any trading EA: it only reads.                 |
//+------------------------------------------------------------------+
#property copyright   "Keystone Monitor"
#property version     "1.00"
#property description "Read-only: reports balance, equity and deals to Keystone Monitor. Never trades."

#define EA_VERSION          "2026.10.17"
#define PAGE_SIZE           500
#define MAX_PAGES_PER_TICK  20
#define TICK_SECONDS        5
#define HTTP_TIMEOUT_MS     10000

input string SyncUrl    = "";    // SyncUrl from the admin screen
input string SyncKey    = "";    // SyncKey from the admin screen (shown once)
input bool   FullResync = false; // Send the whole history again, once

// How often to sync when nothing is happening. The server sends its own
// value back on every reply and this follows it.
int      g_interval = 120;
datetime g_lastAttempt = 0;
bool     g_pending = true;       // a deal has landed since the last sync
bool     g_resetOnce = false;    // FullResync, applied at the first sync
string   g_status = "starting";

int OnInit()
  {
   if(StringFind(SyncUrl, "https://") != 0)
     {
      Alert("KeystoneSync: SyncUrl must be the https:// address from the admin screen.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   if(StringFind(SyncKey, "ptk_") != 0)
     {
      Alert("KeystoneSync: SyncKey must be the key from the admin screen (it starts ptk_).");
      return(INIT_PARAMETERS_INCORRECT);
     }
   // Applied at the first sync rather than here: at terminal start-up the
   // login is often not known yet, so the watermark's name is not either.
   g_resetOnce = FullResync;
   EventSetTimer(TICK_SECONDS);
   ShowStatus();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

// The timer runs every few seconds but only syncs when a deal has landed
// or the interval has passed, so a grid closing thirty positions at once
// becomes one request rather than thirty.
void OnTimer()
  {
   if(!TerminalInfoInteger(TERMINAL_CONNECTED))
      return;
   if(g_pending || TimeLocal() - g_lastAttempt >= g_interval)
      SyncNow();
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD)
      g_pending = true;
  }

// One watermark per login, so moving the EA between accounts in the same
// terminal never skips or mixes history.
string WatermarkName()
  {
   return "KeystoneSync_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "_wm";
  }

// Deal times are in broker server time, which is not UTC. The difference
// between TimeTradeServer() and TimeGMT() is the broker's offset right now.
// TimeTradeServer(), not TimeCurrent(): TimeCurrent() stops when ticks
// stop, so over a weekend the offset would grow by a second every second.
// Rounded to 15 minutes to take out the jitter between the two calls.
//
// Known limit: history resent after a daylight-saving change is converted
// with today's offset, so deals from before it can be an hour out.
int ServerToUtcOffset()
  {
   return (int)MathRound((double)(TimeTradeServer() - TimeGMT()) / 900.0) * 900;
  }

string MsToIso(long ms)
  {
   datetime t = (datetime)(ms / 1000);
   int rem = (int)(ms % 1000);
   if(rem < 0)
      rem += 1000;
   MqlDateTime dt;
   TimeToStruct(t, dt);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec, rem);
  }

string JsonEscape(string s)
  {
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c == '"')
         out += "\\\"";
      else
         if(c == '\\')
            out += "\\\\";
         else
            if(c < 32)
               out += " ";
            else
               out += ShortToString(c);
     }
   return out;
  }

string Num(double v, int digits)
  {
   if(!MathIsValidNumber(v))
      return "0";
   return DoubleToString(v, digits);
  }

// The deals from the watermark onwards, oldest first, at most PAGE_SIZE.
// Returns the JSON list; sets count, the last deal's server time, and
// whether more remain.
string BuildDeals(datetime watermark, int &count, datetime &lastTime, bool &more)
  {
   count = 0;
   lastTime = watermark;
   more = false;

   if(!HistorySelect(watermark, TimeTradeServer() + 3600))
      return "[]";

   int total = HistoryDealsTotal();
   if(total > 999999)
      total = 999999;

   // Sorted by time explicitly rather than trusting the history's order:
   // paging depends on it. Each key is the deal's time in ms with its slot
   // in the low six digits, so one ArraySort orders them.
   long keys[];
   ulong tickets[];
   ArrayResize(keys, total);
   ArrayResize(tickets, total);
   int k = 0;
   for(int i = 0; i < total; i++)
     {
      ulong t = HistoryDealGetTicket(i);
      if(t == 0)
         continue;
      if((datetime)HistoryDealGetInteger(t, DEAL_TIME) < watermark)
         continue;
      tickets[k] = t;
      keys[k] = HistoryDealGetInteger(t, DEAL_TIME_MSC) * 1000000 + k;
      k++;
     }
   ArrayResize(keys, k);
   ArraySort(keys);

   int utcOffset = ServerToUtcOffset();
   int n = MathMin(k, PAGE_SIZE);
   more = k > PAGE_SIZE;

   string json = "[";
   for(int j = 0; j < n; j++)
     {
      ulong t = tickets[(int)(keys[j] % 1000000)];
      long msc = HistoryDealGetInteger(t, DEAL_TIME_MSC);
      if(j > 0)
         json += ",";
      json += "{\"ticket\":\"" + StringFormat("%I64u", t) + "\""
            + ",\"position\":\"" + IntegerToString(HistoryDealGetInteger(t, DEAL_POSITION_ID)) + "\""
            + ",\"time\":\"" + MsToIso(msc - (long)utcOffset * 1000) + "\""
            + ",\"type\":\"" + EnumToString((ENUM_DEAL_TYPE)HistoryDealGetInteger(t, DEAL_TYPE)) + "\""
            + ",\"entry\":\"" + EnumToString((ENUM_DEAL_ENTRY)HistoryDealGetInteger(t, DEAL_ENTRY)) + "\""
            + ",\"symbol\":\"" + JsonEscape(HistoryDealGetString(t, DEAL_SYMBOL)) + "\""
            + ",\"volume\":" + Num(HistoryDealGetDouble(t, DEAL_VOLUME), 4)
            + ",\"price\":" + Num(HistoryDealGetDouble(t, DEAL_PRICE), 6)
            + ",\"profit\":" + Num(HistoryDealGetDouble(t, DEAL_PROFIT), 2)
            + ",\"swap\":" + Num(HistoryDealGetDouble(t, DEAL_SWAP), 2)
            + ",\"commission\":" + Num(HistoryDealGetDouble(t, DEAL_COMMISSION), 2)
            + ",\"fee\":" + Num(HistoryDealGetDouble(t, DEAL_FEE), 2)
            + ",\"magic\":" + IntegerToString(HistoryDealGetInteger(t, DEAL_MAGIC))
            + ",\"comment\":\"" + JsonEscape(HistoryDealGetString(t, DEAL_COMMENT)) + "\"}";
      count++;
      lastTime = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
     }
   json += "]";
   return json;
  }

string BuildAccount()
  {
   return "{\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\""
          + ",\"server\":\"" + JsonEscape(AccountInfoString(ACCOUNT_SERVER)) + "\""
          + ",\"company\":\"" + JsonEscape(AccountInfoString(ACCOUNT_COMPANY)) + "\""
          + ",\"currency\":\"" + JsonEscape(AccountInfoString(ACCOUNT_CURRENCY)) + "\""
          + ",\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE))
          + ",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2)
          + ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2)
          + ",\"credit\":" + Num(AccountInfoDouble(ACCOUNT_CREDIT), 2)
          + ",\"margin\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN), 2)
          + ",\"free_margin\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2)
          + ",\"margin_level\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL), 2)
          + ",\"positions\":" + IntegerToString(PositionsTotal())
          + ",\"floating\":" + Num(AccountInfoDouble(ACCOUNT_PROFIT), 2)
          + "}";
  }

// Reads one integer field out of the server's small JSON reply.
int ReplyInt(string reply, string field, int fallback)
  {
   int at = StringFind(reply, "\"" + field + "\":");
   if(at < 0)
      return fallback;
   return (int)StringToInteger(StringSubstr(reply, at + StringLen(field) + 3, 6));
  }

// Sends one page. Returns the HTTP status (or -1).
int SendPage(bool &more)
  {
   more = false;
   if(AccountInfoInteger(ACCOUNT_LOGIN) <= 0)
      return -1;

   string gv = WatermarkName();
   if(g_resetOnce)
     {
      GlobalVariableDel(gv);
      g_resetOnce = false;
     }
   datetime watermark = GlobalVariableCheck(gv) ? (datetime)GlobalVariableGet(gv) : 0;

   // The deals and the balance must describe the same moment, or a deposit
   // landing between the two reads would look like a jump in equity with no
   // deal to explain it. A deal moves the balance, so if the balance changed
   // while the deals were being read, read them again.
   int count = 0;
   datetime lastTime = watermark;
   string deals = "[]";
   for(int attempt = 0; attempt < 3; attempt++)
     {
      double before = AccountInfoDouble(ACCOUNT_BALANCE);
      deals = BuildDeals(watermark, count, lastTime, more);
      if(AccountInfoDouble(ACCOUNT_BALANCE) == before)
         break;
     }

   string payload = "{\"v\":1,\"ea\":\"" + EA_VERSION + "\""
                    + ",\"account\":" + BuildAccount()
                    + ",\"deals\":" + deals
                    + ",\"more\":" + (more ? "true" : "false")
                    + "}";

   char body[];
   char reply[];
   string replyHeaders;
   int len = StringToCharArray(payload, body, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0)
      ArrayResize(body, len - 1); // drop the terminating NUL
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + SyncKey + "\r\n";

   ResetLastError();
   int status = WebRequest("POST", SyncUrl, headers, HTTP_TIMEOUT_MS, body, reply, replyHeaders);
   string text = CharArrayToString(reply, 0, WHOLE_ARRAY, CP_UTF8);

   if(status == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         g_status = "blocked: add the site to Tools -> Options -> Expert Advisors -> Allow WebRequest";
      else
         g_status = "network error " + IntegerToString(err);
      Print("KeystoneSync: ", g_status);
      return status;
     }
   if(status != 200)
     {
      g_status = "HTTP " + IntegerToString(status) + ": " + StringSubstr(text, 0, 200);
      Print("KeystoneSync: ", g_status);
      return status;
     }

   // Stored: move the watermark to the last deal sent. The deals in that
   // same second are sent again next time, which the server ignores, so a
   // deal stamped in a second already sent is never skipped. If a whole
   // page shares one second, step past it rather than loop forever.
   datetime next = watermark;
   if(count > 0)
      next = lastTime;
   if(more && next <= watermark)
      next = watermark + 1;

   if(StringFind(text, "\"resync\":true") >= 0)
     {
      next = 0;
      more = true;
      Print("KeystoneSync: the server asked for the whole history again.");
     }

   GlobalVariableSet(gv, (double)next);
   GlobalVariablesFlush();

   int interval = ReplyInt(text, "interval", g_interval);
   if(interval >= 30 && interval <= 600)
      g_interval = interval;

   g_status = "OK at " + TimeToString(TimeLocal(), TIME_MINUTES | TIME_SECONDS) + ", " + IntegerToString(count) + " deals sent";
   return status;
  }

void SyncNow()
  {
   g_lastAttempt = TimeLocal();
   bool more = false;
   for(int page = 0; page < MAX_PAGES_PER_TICK; page++)
     {
      int status = SendPage(more);
      if(status != 200)
        {
         // Wait for the next interval rather than retrying every tick.
         g_pending = false;
         ShowStatus();
         return;
        }
      if(!more)
         break;
     }
   // Still more history to send: carry on at the next tick.
   g_pending = more;
   ShowStatus();
  }

void ShowStatus()
  {
   Comment("KeystoneSync " + EA_VERSION + " (read-only)\n" + g_status);
  }
//+------------------------------------------------------------------+
