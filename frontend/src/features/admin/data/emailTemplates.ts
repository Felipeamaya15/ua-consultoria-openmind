export type EmailTemplateType = "order_received" | "payment_success" | "payment_rejected" | "order_shipped"

export interface EmailTemplate {
  enabled: boolean
  subject: string
  preheader: string
  body: string
}

export type EmailTemplates = Record<EmailTemplateType, EmailTemplate>

export const emailTemplateDefinitions: Record<EmailTemplateType, { label: string; description: string }> = {
  order_received: { label: "Confirmación de recepción", description: "Se prepara al recibir una nueva solicitud de pedido." },
  payment_success: { label: "Pago exitoso", description: "Se prepara cuando el medio de pago confirma la transacción." },
  payment_rejected: { label: "Pago rechazado", description: "Se prepara cuando el medio de pago informa que no pudo procesar el cobro." },
  order_shipped: { label: "Pedido despachado", description: "Se prepara cuando el emprendedor marca el pedido como enviado." },
}

export const createDefaultEmailTemplates = (): EmailTemplates => ({
  order_received: {
    enabled: true,
    subject: "Recibimos tu pedido {{orderNumber}}",
    preheader: "Estamos preparando tu solicitud.",
    body: "Hola {{customerName}},\n\nRecibimos tu pedido {{orderNumber}}. Te avisaremos cuando se confirme el pago y avance la preparación.\n\nTotal del pedido: {{orderTotal}}\nMétodo de entrega: {{shippingMethod}}\n\nGracias por comprar en {{storeName}}.",
  },
  payment_success: {
    enabled: true,
    subject: "Tu pago fue confirmado · {{orderNumber}}",
    preheader: "Tu compra ya está en preparación.",
    body: "Hola {{customerName}},\n\nConfirmamos el pago de tu pedido {{orderNumber}} por {{orderTotal}}. Comenzaremos a preparar tu compra.\n\nTe enviaremos otra actualización cuando tu pedido sea despachado.\n\n{{storeName}}",
  },
  payment_rejected: {
    enabled: true,
    subject: "No pudimos confirmar tu pago · {{orderNumber}}",
    preheader: "Puedes intentar nuevamente con otro medio de pago.",
    body: "Hola {{customerName}},\n\nNo pudimos confirmar el pago de tu pedido {{orderNumber}}. No se realizó ningún cobro.\n\nPuedes volver a intentarlo usando otro medio de pago o contactarnos si necesitas ayuda.\n\n{{storeName}}",
  },
  order_shipped: {
    enabled: true,
    subject: "Tu pedido ya fue despachado · {{orderNumber}}",
    preheader: "Tu compra va en camino.",
    body: "Hola {{customerName}},\n\nTu pedido {{orderNumber}} ya fue despachado mediante {{carrier}}.\n\nCódigo de seguimiento: {{trackingCode}}\n\nGracias por comprar en {{storeName}}.",
  },
})

