// Every row a query matches. PostgREST stops at 1000 rows per request
// whatever .limit() asks for, so anything that can grow past that is read
// a page at a time. build(from, to) returns the query with .range applied.
const PAGE = 1000;

export async function fetchAllPages(build) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}
