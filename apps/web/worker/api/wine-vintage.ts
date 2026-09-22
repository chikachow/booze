import { wineVintages } from "@chikachow/booze-db";
import { sql } from "drizzle-orm";
import type { VintageStatus } from "../../shared/wine-identity.ts";

// During migration/deployment overlap the old writer can omit vintage_status.
// A recorded year remains known; legacy NV alone never proves non-vintage.
export const storedVintageStatus = sql<VintageStatus>`case
  when ${wineVintages.vintageYear} is not null then 'year'
  when ${wineVintages.vintageStatus} = 'non_vintage' then 'non_vintage'
  else 'unknown' end`;

export const storedVintageLabel = sql<string>`case
  when ${wineVintages.vintageYear} is not null then cast(${wineVintages.vintageYear} as text)
  when ${wineVintages.vintageStatus} = 'non_vintage' then 'NV'
  else 'Unknown' end`;
