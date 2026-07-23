import type { RequestHandler } from "@sveltejs/kit";
import { postgresApi } from "$lib/api/postgres-db";
import { storeTools } from "$lib/ai/store-tools";
import { STRIPE_WRITE_TOOLS } from "$lib/plugins/catalog";

function sseEvent(payload: unknown): Response {
  return new Response(`data: ${JSON.stringify(payload)}\n\n`, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function toolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export const POST: RequestHandler = async ({ request }) => {
  const authHeader = request.headers.get("Authorization");
  let token: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  // Validar sesión
  const me = await postgresApi.session_me(token);
  if (!me) {
    return new Response(JSON.stringify({ error: "Sesión no válida o expirada" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { messages } = await request.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Mensajes inválidos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [settings, stats, products, sales] = await Promise.all([
      postgresApi.get_settings(token),
      postgresApi.dashboard_stats(token),
      postgresApi.list_products(true, token),
      postgresApi.list_sales(token),
    ]);
    const tools = storeTools(stats, products, sales);

    const todayStr = new Date().toISOString().slice(0, 10);
    const context = {
      tienda: settings.shop_name,
      fecha_hoy: todayStr,
      ventas_hoy_eur: (stats.sales_today_cents / 100).toFixed(2),
      tickets_hoy: stats.sales_today_count,
      ventas_ayer_eur: ((stats.sales_yesterday_cents ?? 0) / 100).toFixed(2),
      ventas_mes_eur: (stats.sales_month_cents / 100).toFixed(2),
      tickets_mes: stats.sales_month_count,
      caja_eur: (stats.cash_balance_cents / 100).toFixed(2),
      iva_mes_eur: (stats.vat_month_cents / 100).toFixed(2),
      tools,
    };

    const systemPrompt = `Te llamas Lucía y eres la asistente virtual inteligente de la tienda "${settings.shop_name}" en España. 
Responde siempre en español, de manera concisa, técnica y con un tono profesional pero cercano y de chica.
Tus habilidades en este CRM incluyen:
- Gestionar y supervisar el inventario (alertar sobre existencias bajas).
- Analizar estadísticas de ventas del día, comparativa con el ayer y consolidados mensuales.
- Controlar movimientos de efectivo e ingresos de caja.
- Calcular desgloses de impuestos e IVA (0%, 4%, 10%, 21% de España).
- Apoyar en operaciones de ventas y facturación de mostrador.
Precios en EUR con IVA incluido. Contexto de negocio actual (JSON compacto): ${JSON.stringify(context)}.
Los resultados de tools son datos reales de la empresa activa: cítalos tal cual y no inventes cifras. No presentes orientación fiscal como asesoramiento legal o fiscal profesional; recomienda confirmarla con una asesoría. Si falta información, indícalo educadamente.`;

    const payloadMsgs = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const url = `${settings.ollama_url.replace(/\/$/, "")}/api/chat`;
    const ollamaPayload: Record<string, unknown> = {
      model: settings.ollama_model,
      stream: true,
      think: false,
      messages: payloadMsgs,
      options: {
        temperature: 0.4,
        num_predict: 96 // Mantener el límite optimizado para evitar timeouts de Cloudflare
      }
    };

    // Stripe MCP is tenant-scoped. Only tools enabled for the active company
    // are exposed to Ollama; unknown or disabled operations never reach Stripe.
    const stripeTools = await postgresApi.list_plugin_tools("stripe_mcp", token).catch(() => []);
    if (stripeTools.length > 0) {
      const ollamaTools = stripeTools.map((tool: any) => ({
        type: "function",
        function: {
          name: tool.name,
          description: `[Stripe] ${tool.description ?? "Herramienta de la cuenta Stripe conectada"}`,
          parameters: tool.inputSchema ?? { type: "object", properties: {} },
        },
      }));
      const plannerResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...ollamaPayload,
          stream: false,
          messages: payloadMsgs,
          tools: ollamaTools,
        }),
      });
      if (!plannerResponse.ok) {
        return new Response(JSON.stringify({ error: `Error de Ollama al elegir herramienta: HTTP ${plannerResponse.status}` }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      const planner = await plannerResponse.json() as any;
      const calls = Array.isArray(planner?.message?.tool_calls) ? planner.message.tool_calls : [];
      if (calls.length === 0) {
        return sseEvent({ content: planner?.message?.content || "No he podido completar la consulta." });
      }

      for (const call of calls) {
        const name = String(call?.function?.name ?? "");
        const args = toolArguments(call?.function?.arguments);
        if (STRIPE_WRITE_TOOLS.has(name)) {
          return sseEvent({
            content: "He preparado una operación en Stripe. Revísala antes de ejecutarla.",
            approval: {
              plugin_key: "stripe_mcp",
              tool_name: name,
              arguments: args,
              label: `Confirmar ${name.replaceAll("_", " ")}`,
            },
          });
        }
      }

      const toolMessages: any[] = [planner.message];
      for (const call of calls) {
        const name = String(call?.function?.name ?? "");
        const result = await postgresApi.call_plugin_tool(
          "stripe_mcp",
          name,
          toolArguments(call?.function?.arguments),
          false,
          token,
        );
        toolMessages.push({ role: "tool", content: JSON.stringify(result.result) });
      }
      ollamaPayload.messages = [...payloadMsgs, ...toolMessages];
      ollamaPayload.tools = ollamaTools;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ollamaPayload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return new Response(JSON.stringify({ error: `Error de Ollama: HTTP ${response.status} ${errText}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Configurar respuesta de Server-Sent Events (SSE)
    const stream = new ReadableStream({
      async start(controller) {
        if (!response.body) {
          controller.close();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            
            // Conservar el fragmento incompleto al final
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = JSON.parse(trimmed);
                const content = parsed.message?.content || "";
                
                // Si hay pensamiento en el JSON (para modelos que admitan el campo thinking nativamente)
                const thinking = parsed.message?.thinking || "";
                
                const dataPayload = JSON.stringify({ content, thinking });
                controller.enqueue(`data: ${dataPayload}\n\n`);
              } catch (e) {
                // Si la línea no es JSON válido, ignorar o reportar
              }
            }
          }

          // Procesar el buffer final si contiene algo
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              const content = parsed.message?.content || "";
              const thinking = parsed.message?.thinking || "";
              controller.enqueue(`data: ${JSON.stringify({ content, thinking })}\n\n`);
            } catch {}
          }
        } catch (err) {
          console.error("Error leyendo stream de Ollama:", err);
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error: any) {
    console.error("Error en endpoint de streaming:", error);
    return new Response(JSON.stringify({ error: error.message || "Error interno de streaming" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
