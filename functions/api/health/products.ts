import { json } from "../_auth";
import { getTableColumns } from "../_products";

export const onRequestGet: PagesFunction = async ({ env }) => {
  const db = env.DB as D1Database;
  const columns = await getTableColumns(db, "products");
  return json({
    ok: true,
    has_products_table: columns.size > 0,
    columns: Array.from(columns.values()).sort(),
  });
};
