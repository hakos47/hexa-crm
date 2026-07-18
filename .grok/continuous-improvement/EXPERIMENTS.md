# EXPERIMENTS

| ID | Hipótesis | Línea base | Métrica | Resultado | Decisión |
|----|-----------|------------|---------|-----------|----------|
| E1 | UI dto. línea + backend discount_cents | UI sin dto. | total/caja = neto | OK ciclo 1 | Adoptado (browser/Tauri) |
| E2 | cancel_sale restaura stock+caja | sin void | stock/caja/IVA | OK ciclo 2 | Adoptado |
| E3 | Postgres create_sale debe usar lineBreakdown+discount | total ignoraba dto (990 vs 900) | total_cents y cash = neto | **OK ciclo 3** live RPC total=900 cash+=900 | Adoptado |
