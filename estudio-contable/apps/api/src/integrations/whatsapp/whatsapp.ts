import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

export interface MensajeWhatsapp {
  destino: string; // E.164
  plantilla: string;
  /** Parámetros posicionales del body de la plantilla aprobada por Meta ({{1}}, {{2}}...). */
  parametros: string[];
  /** Texto plano equivalente (para log / driver console). */
  textoPlano: string;
}

export interface WhatsappDriver {
  enviar(m: MensajeWhatsapp): Promise<{ id: string }>;
}

/** Driver de desarrollo: no envía, solo loguea. */
class ConsoleDriver implements WhatsappDriver {
  async enviar(m: MensajeWhatsapp) {
    logger.info({ destino: m.destino, plantilla: m.plantilla }, `[WhatsApp:console] ${m.textoPlano}`);
    return { id: `console-${Date.now()}` };
  }
}

/**
 * Meta WhatsApp Cloud API. Los mensajes iniciados por la empresa (fuera de la
 * ventana de 24h) DEBEN usar una plantilla aprobada (categoría "utility").
 */
class MetaCloudDriver implements WhatsappDriver {
  async enviar(m: MensajeWhatsapp) {
    if (!env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ACCESS_TOKEN) {
      throw new Error("WhatsApp Cloud API no configurada (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)");
    }
    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: m.destino.replace(/^\+/, ""),
        type: "template",
        template: {
          name: m.plantilla,
          language: { code: env.WHATSAPP_TEMPLATE_LANG },
          components: [{ type: "body", parameters: m.parametros.map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    const json = (await resp.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (!resp.ok || !json.messages?.[0]) throw new Error(json.error?.message ?? `HTTP ${resp.status}`);
    return { id: json.messages[0].id };
  }
}

export const whatsapp: WhatsappDriver = env.WHATSAPP_DRIVER === "meta" ? new MetaCloudDriver() : new ConsoleDriver();
