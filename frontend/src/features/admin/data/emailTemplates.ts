export type EmailTemplateType =
  | "order_received"
  | "payment_success"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled";

export interface EmailTemplate {
  enabled: boolean;
  subject: string;
  preheader: string;
  body: string;
}

export type EmailTemplates = Record<EmailTemplateType, EmailTemplate>;

export const emailTemplateDefinitions: Record<EmailTemplateType, { label: string; description: string }> = {
  order_received: {
    label: "Pendiente",
    description: "Se envía automáticamente al recibir un nuevo pedido en estado Pendiente.",
  },
  payment_success: {
    label: "Pagado/En preparación",
    description: "Se envía cuando se confirma el pago y la orden pasa a Pagado/En preparación.",
  },
  order_shipped: {
    label: "En camino",
    description: "Se envía cuando el pedido pasa al estado En camino.",
  },
  order_delivered: {
    label: "Entregado",
    description: "Se envía cuando el pedido ha sido entregado exitosamente al cliente.",
  },
  order_cancelled: {
    label: "Cancelado",
    description: "Se envía cuando el pedido es cancelado.",
  },
};

export const createDefaultEmailTemplates = (): EmailTemplates => ({
  order_received: {
    enabled: true,
    subject: "Recibimos tu pedido {{orderNumber}}",
    preheader: "Estamos preparando tu solicitud.",
    body: "Hola {{customerName}},\n\nRecibimos tu pedido {{orderNumber}}. Te avisaremos cuando se confirme el pago y avance la preparación.\n\nResumen de compra:\n{{orderSummary}}\n\nTotal del pedido: {{orderTotal}}\nMétodo de entrega: {{shippingMethod}}\n\nGracias por comprar en {{storeName}}.",
  },
  payment_success: {
    enabled: true,
    subject: "Tu pago fue confirmado y estamos preparando tu pedido · {{orderNumber}}",
    preheader: "Tu compra ya está en preparación.",
    body: "Hola {{customerName}},\n\nConfirmamos el pago de tu pedido {{orderNumber}} por {{orderTotal}}. Ya estamos preparando tus productos.\n\nResumen de compra:\n{{orderSummary}}\n\nTotal del pedido: {{orderTotal}}\nMétodo de entrega: {{shippingMethod}}\n\nTe enviaremos una notificación por correo cuando tu pedido esté en camino.\n\n{{storeName}}",
  },
  order_shipped: {
    enabled: true,
    subject: "Tu pedido ya fue despachado · {{orderNumber}}",
    preheader: "Tu compra va en camino.",
    body: "Hola {{customerName}},\n\nTu pedido {{orderNumber}} ya fue despachado y va en camino.\n\nTransportista: {{carrier}}\nCódigo de seguimiento: {{trackingCode}}\n\nRevisa el estado de tu pedido aquí (te pediremos el correo con el que compraste): {{trackingLink}}\n\nGracias por comprar en {{storeName}}.",
  },
  order_delivered: {
    enabled: true,
    subject: "¡Tu pedido fue entregado! · {{orderNumber}}",
    preheader: "Confirmamos la entrega de tu compra.",
    body: "Hola {{customerName}},\n\nTe confirmamos que tu pedido {{orderNumber}} ha sido entregado con éxito.\n\nResumen de tu compra:\n{{orderSummary}}\n\nEsperamos que disfrutes tus productos. Si tienes cualquier consulta, puedes responder directamente a este correo.\n\n¡Gracias por confiar en {{storeName}}!",
  },
  order_cancelled: {
    enabled: true,
    subject: "Tu pedido fue cancelado · {{orderNumber}}",
    preheader: "Información sobre la cancelación de tu pedido.",
    body: "Hola {{customerName}},\n\nTe informamos que tu pedido {{orderNumber}} ha sido cancelado.\n\nDetalle del pedido cancelado:\n{{orderSummary}}\n\nTotal: {{orderTotal}}\n\nSi tienes dudas sobre esta cancelación o requieres asistencia, puedes responder directamente a este correo.\n\n{{storeName}}",
  },
});
