import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseType, normaliseEntry, kindOf } from "@/lib/dealKinds";

test("MetaTrader enum names are shortened", () => {
  assert.equal(normaliseType("DEAL_TYPE_BUY"), "buy");
  assert.equal(normaliseType("DEAL_TYPE_COMMISSION_DAILY"), "commission_daily");
  assert.equal(normaliseType("sell"), "sell");
  assert.equal(normaliseType("DEAL_TYPE_<script>"), null);
  assert.equal(normaliseEntry("DEAL_ENTRY_OUT_BY"), "out_by");
  assert.equal(normaliseEntry("DEAL_ENTRY_NONSENSE"), null);
});

test("deposits are cash, credit is neither, charges are trading", () => {
  assert.equal(kindOf("buy"), "trade");
  assert.equal(kindOf("sell_canceled"), "trade");
  assert.equal(kindOf("balance"), "cash");
  assert.equal(kindOf("bonus"), "cash");
  assert.equal(kindOf("credit"), "credit");
  assert.equal(kindOf("commission"), "other");
  assert.equal(kindOf("interest"), "other");
  assert.equal(kindOf("something_new"), "other");
});
