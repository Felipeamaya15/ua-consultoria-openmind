import { checkoutPreviewStep } from '../visual/pages';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { orderService } from '../services/orderService';
import { validatePromotion, type ValidatedPromotion } from '../services/promotionService';
import { getDeliveryAlternatives, getShippingQuotes, type ShippingQuote, type ShippingConfiguration } from '../services/shippingService';
import PickupDetails from '../components/checkout/PickupDetails';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../data/mockData';
import { comunasDeRegion, esComunaDeRegion } from '../data/comunasChile';
import {
  Stepper,
  Button,
  Input,
  Select,
  Alert,
  Icon,
} from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { useStoreIdentity } from '../context/StoreIdentityContext';
import { readCheckoutAuthSettings, type CheckoutAuthSettings as AuthSettings } from '../services/storePreferences';
import { transbankPaymentService } from '../../checkout/services/transbankPaymentService';
import { paypalPaymentService } from '../../checkout/services/paypalPaymentService';

const STEPS = [
  { id: 'contact', label: 'Contacto' },
  { id: 'delivery', label: 'Entrega' },
  { id: 'payment', label: 'Pago' },
  { id: 'confirm', label: 'Confirmar' },
];

const REGIONES = [
  'Metropolitana',
  'Valparaíso',
  'Biobío',
  'Araucanía',
  'Los Lagos',
  'Antofagasta',
  'Atacama',
  'Coquimbo',
  'OHiggins',
  'Maule',
  'Ñuble',
  'Los Ríos',
  'Aysén',
  'Magallanes',
  'Arica',
  'Tarapacá',
].map((region) => ({
  value: region,
  label: region,
}));

type AuthMode = 'guest' | 'login' | 'google';

type ShippingOption = {
  id: string;
  label: string;
  icon: string;
  desc: string;
  priceLabel: string;
  requiresAddress: boolean;
  pickup?: ShippingConfiguration['pickup'];
};

type PaymentOption = {
  id: string;
  label: string;
  icon: string;
  desc: string;
};

type TransferDetails = {
  bank_name: string;
  account_type: string;
  account_number: string;
  holder_rut: string;
  holder_name: string;
  confirmation_email: string;
};

function getAvailableAuthModes(settings: AuthSettings): AuthMode[] {
  const modes: AuthMode[] = [];

  if (settings.guestCheckout && settings.requiresAuth !== 'required') {
    modes.push('guest');
  }

  if (settings.emailPassword) {
    modes.push('login');
  }

  if (settings.google) {
    modes.push('google');
  }

  return modes.length ? modes : ['login'];
}

const defaultShippingOptions: ShippingOption[] = [
  {
    id: 'Chilexpress',
    label: 'Chilexpress',
    icon: 'box',
    desc: 'Tarifa de despacho configurada por la tienda',
    priceLabel: 'Por cotizar',
    requiresAddress: true,
  },
  {
    id: 'Starken',
    label: 'Starken',
    icon: 'truck',
    desc: 'Tarifa de despacho configurada por la tienda',
    priceLabel: 'Por cotizar',
    requiresAddress: true,
  },
  {
    id: 'Retiro',
    label: 'Retiro en tienda',
    icon: 'store',
    desc: 'Retira tu pedido en nuestro establecimiento',
    priceLabel: 'Gratis ($0)',
    requiresAddress: false,
  },
];

const paymentPresentation: PaymentOption[] = [
  {
    id: 'Transbank',
    label: 'Webpay / Transbank',
    icon: 'card',
    desc: 'Tarjeta debito, credito o prepago',
  },
  {
    id: 'MercadoPago',
    label: 'Mercado Pago',
    icon: 'wallet',
    desc: 'Tarjetas o saldo Mercado Pago',
  },
  {
    id: 'PayPal',
    label: 'PayPal',
    icon: 'card',
    desc: 'Cuenta PayPal o tarjeta',
  },
  {
    id: 'Linkify',
    label: 'Linkify',
    icon: 'link',
    desc: 'Pago por link',
  },
  {
    id: 'Transferencia',
    label: 'Transferencia bancaria',
    icon: 'bank',
    desc: 'Verificacion manual en 24-48h',
  },
];

const fmtCardNumber = (value: string) =>
  value
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();

const fmtExpiry = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 4);

  return digits.length > 2
    ? `${digits.slice(0, 2)}/${digits.slice(2)}`
    : digits;
};

const fmtCvv = (value: string) =>
  value.replace(/\D/g, '').slice(0, 4);

const last4 = (number: string) =>
  number.replace(/\D/g, '').slice(-4);

interface CardData {
  number: string;
  name: string;
  expiry: string;
  cvv: string;
}

function CardFields({
  prefix,
  data,
  onField,
  errors,
}: {
  prefix: string;
  data: CardData;
  onField: (
    key: keyof CardData,
    value: string,
  ) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Input
        label="Número de tarjeta"
        value={data.number}
        onChange={(event) =>
          onField(
            'number',
            fmtCardNumber(event.target.value),
          )
        }
        placeholder="1234 5678 9012 3456"
        inputMode="numeric"
        readOnly
        autoComplete="off"
        error={errors[`${prefix}Number`]}
        iconRight={
          <Icon
            name="card"
            className="w-4 h-4 text-[#667085]"
          />
        }
      />

      <Input
        label="Nombre del titular"
        value={data.name}
        onChange={(event) =>
          onField(
            'name',
            event.target.value.toUpperCase(),
          )
        }
        placeholder="COMO APARECE EN LA TARJETA"
        readOnly
        autoComplete="off"
        error={errors[`${prefix}Name`]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Vencimiento"
          value={data.expiry}
          onChange={(event) =>
            onField(
              'expiry',
              fmtExpiry(event.target.value),
            )
          }
          placeholder="MM/AA"
          inputMode="numeric"
          readOnly
          autoComplete="off"
          error={errors[`${prefix}Expiry`]}
        />

        <Input
          label="CVV"
          type="password"
          value={data.cvv}
          onChange={(event) =>
            onField(
              'cvv',
              fmtCvv(event.target.value),
            )
          }
          placeholder="•••"
          inputMode="numeric"
          readOnly
          autoComplete="off"
          error={errors[`${prefix}Cvv`]}
          hint="3 o 4 dígitos"
        />
      </div>
    </>
  );
}

export default function Checkout() {
  const {
    items,
    subtotal,
    clearCart,
    promoCode,
    removePromo,
    shippingMethod,
    setShippingMethod,
  } = useCart();

  const submitting = useRef(false);
  const checkoutAttempt = useRef({signature: '', key: ''});

  const { route, isMinimal, isVisual, isCatalog } =
    useStorefrontTemplate();

  const { identity } = useStoreIdentity();
  const authSettings = useMemo(
    () => readCheckoutAuthSettings(identity),
    [identity],
  );
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [shippingLoading, setShippingLoading] = useState(true);
  const [shippingError, setShippingError] = useState('');
  const [shippingLoadAttempt, setShippingLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setShippingLoading(true);
    setShippingError('');
    getDeliveryAlternatives(controller.signal).then(configuration => {
      if (controller.signal.aborted) return;
      const enabled = defaultShippingOptions.filter(option => {
        if (option.id === 'Chilexpress') return configuration.chilexpress.enabled;
        if (option.id === 'Starken') return configuration.starken.enabled;
        return configuration.pickup.enabled;
      }).map(option => option.id === 'Retiro' ? {
        ...option,
        desc: 'Retira tu pedido en nuestro establecimiento',
        pickup: configuration.pickup,
        priceLabel: 'Gratis ($0)',
      } : option);
      setShippingOptions(enabled);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setShippingOptions([]);
        setShippingError(cause instanceof Error ? cause.message : 'No se pudieron cargar las alternativas de entrega.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setShippingLoading(false);
    });
    return () => controller.abort();
  }, [shippingLoadAttempt]);
  const availableAuthModes = useMemo(
    () => getAvailableAuthModes(authSettings),
    [authSettings],
  );

  const navigate = useNavigate();

  const [step, setStep] = useState(() => {
    try { return checkoutPreviewStep(window.location.search, window.parent !== window, window.parent.location.pathname); }
    catch { return 'contact'; }
  });

  const [authMode, setAuthMode] =
    useState<AuthMode>(() => availableAuthModes[0]);

  const [contact, setContact] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const [address, setAddress] = useState({
    street: '',
    number: '',
    apt: '',
    city: '',
    region: 'Metropolitana',
  });

  const [paymentMethod, setPaymentMethod] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [errors, setErrors] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    if (!availableAuthModes.includes(authMode)) {
      setAuthMode(availableAuthModes[0]);
    }
  }, [authMode, availableAuthModes]);

  /*
   * ==========================================================
   * DATOS DE DEMOSTRACIÓN DE PAGO
   * ==========================================================
   */
  const [transbank, setTransbank] = useState({
    cardType: 'credito',
    number: '0000 0000 0000 0000',
    name: 'CLIENTE DEMO',
    expiry: '12/30',
    cvv: '000',
    rut: '11.111.111-1',
  });

  const [mercadopago, setMercadopago] =
    useState({
      number: '0000 0000 0000 0000',
      name: 'CLIENTE DEMO',
      expiry: '12/30',
      cvv: '000',
      installments: '1',
      email: 'demo@example.com',
    });

  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState('');
  const [transferDetails, setTransferDetails] = useState<TransferDetails | null>(null);

  useEffect(() => {
    let active = true;
    const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
    const loadPayments = async () => {
      try {
        const response = await fetch(`${apiBase}/api/pagos/activos/`);
        const body = await response.json();
        if (!response.ok || body.exito !== true || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
          throw new Error('No se pudieron consultar los medios de pago de la tienda.');
        }
        const keys: Record<string, string> = {
          Transbank: 'transbank',
          MercadoPago: 'mercadopago',
          PayPal: 'paypal',
          Linkify: 'linkify',
          Transferencia: 'transfer',
        };

        const transferConfiguration = body.data.transfer;
        const transferFields =
          transferConfiguration?.enabled === true &&
          transferConfiguration?.fields &&
          typeof transferConfiguration.fields === 'object'
            ? transferConfiguration.fields
            : null;

        const requiredTransferFields = [
          'bank_name',
          'account_type',
          'account_number',
          'holder_rut',
          'holder_name',
          'confirmation_email',
        ];

        const validTransfer =
          transferFields &&
          requiredTransferFields.every(
            (field) => String(transferFields[field] ?? '').trim(),
          );

        const enabled = paymentPresentation.filter((option) => {
          const configuration = body.data[keys[option.id]] ?? body.data[option.id];
          if (option.id === 'Transferencia') {
            return configuration?.enabled === true && Boolean(validTransfer);
          }
          return configuration?.enabled === true;
        });

        if (active) {
          setTransferDetails(
            validTransfer
              ? {
                  bank_name: String(transferFields.bank_name),
                  account_type: String(transferFields.account_type),
                  account_number: String(transferFields.account_number),
                  holder_rut: String(transferFields.holder_rut),
                  holder_name: String(transferFields.holder_name),
                  confirmation_email: String(transferFields.confirmation_email),
                }
              : null,
          );
          setPaymentOptions(enabled);
          setPaymentsError('');
        }
      } catch {
        if (active) {setPaymentOptions([]); setPaymentsError('No se pudieron cargar los medios de pago. Recarga la página para reintentar.');}
      } finally {
        if (active) setPaymentsLoading(false);
      }
    };
    void loadPayments();
    return () => {active = false;};
  }, []);

  /*
   * ==========================================================
   * LÓGICA DE ACTUALIZACIÓN DEL TOTAL Y DESPACHO
   * ==========================================================
   */
  const [shippingQuotes, setShippingQuotes] = useState<Record<string, ShippingQuote & {destino: string}>>({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [quoteErrorKind, setQuoteErrorKind] = useState('');
  const [promoInput, setPromoInput] = useState(promoCode);
  const [checkoutPromoCode, setCheckoutPromoCode] = useState(promoCode);
  const [validatedPromotion, setValidatedPromotion] = useState<ValidatedPromotion | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [promoMessage, setPromoMessage] = useState('');
  const [promotionBasis, setPromotionBasis] = useState('');
  const promotionRequest = useRef(0);
  const applyingPromotion = useRef(false);
  
  const destinationKey = JSON.stringify([shippingMethod, address.region, address.city]);
  const selectedShippingOption = shippingOptions.find(option => option.id === shippingMethod);
  const candidateQuote = shippingQuotes[shippingMethod];
  const selectedQuote = candidateQuote?.destino === destinationKey && candidateQuote.vence_en > Date.now() / 1000
    ? candidateQuote : undefined;
    
  // => CÁLCULO DEL TOTAL DEL PEDIDO SUMANDO EL COSTO DE DESPACHO <=
  const quotedShipping = shippingMethod === 'Retiro' ? 0 : selectedQuote?.monto ?? null;
  const currentPromotionBasis = JSON.stringify([subtotal, quotedShipping, checkoutPromoCode]);
  const currentPromotion = promotionBasis === currentPromotionBasis ? validatedPromotion : null;
  const shipping = currentPromotion ? currentPromotion.shipping : quotedShipping;
  const effectiveDiscount = currentPromotion ? Math.min(subtotal, currentPromotion.discount) : 0;
  const total = subtotal - effectiveDiscount + (shipping ?? 0);

  useEffect(() => {
    promotionRequest.current += 1;
    applyingPromotion.current = false;
    setPromoLoading(false);
    setValidatedPromotion(null);
    setPromoMessage('');
    if (checkoutPromoCode) setPromoError('Vuelve a aplicar el codigo porque cambio el pedido o el envio.');
  }, [subtotal, quotedShipping]);

  const handleApplyPromotion = async () => {
    if (applyingPromotion.current) return;
    const code = promoInput.trim();
    if (!code) {
      setValidatedPromotion(null);
      setCheckoutPromoCode('');
      setPromoMessage('');
      setPromoError('Ingresa un codigo promocional.');
      return;
    }
    if (quotedShipping === null) {
      setPromoError('Selecciona y cotiza el envio antes de aplicar el codigo.');
      return;
    }
    setPromoLoading(true);
    applyingPromotion.current = true;
    const requestId = ++promotionRequest.current;
    setPromoError('');
    setPromoMessage('');
    try {
      const result = await validatePromotion(code, subtotal, quotedShipping);
      if (requestId !== promotionRequest.current) return;
      setValidatedPromotion(result);
      setPromotionBasis(JSON.stringify([subtotal, quotedShipping, result.code]));
      setCheckoutPromoCode(result.code);
      setPromoInput(result.code);
      setPromoMessage(result.message);
    } catch (cause) {
      if (requestId !== promotionRequest.current) return;
      setValidatedPromotion(null);
      setCheckoutPromoCode('');
      setPromoError(cause instanceof Error ? cause.message : 'El codigo promocional no es valido.');
    } finally {
      if (requestId === promotionRequest.current) { setPromoLoading(false); applyingPromotion.current = false; }
    }
  };
  
  // Validamos que exista un costo real de despacho, o sea retiro en tienda.
  const deliveryReady = !shippingLoading && !shippingError && !!selectedShippingOption
    && (shippingMethod === 'Retiro' ? true : (!!selectedQuote && !quoteLoading && !quoteError));

  // Si no hay tarifa para el destino, reintentar no sirve: se ofrece cambiar de alternativa o de comuna.
  const quoteNeedsOtherOption = ['sin_tarifa', 'no_disponible', 'destino'].includes(quoteErrorKind);
  const quoteUnavailable = ['sin_tarifa', 'no_disponible'].includes(quoteErrorKind);
  const otherShippingOptions = shippingOptions.filter(option => option.id !== shippingMethod);

  useEffect(() => {
    setShippingQuotes({});
    setQuoteError('');
    setQuoteErrorKind('');
    setQuoteLoading(false);
    if (!selectedShippingOption?.requiresAddress || !esComunaDeRegion(address.city, address.region)) return;
    const controller = new AbortController();
    let expiry: ReturnType<typeof setTimeout>;
    setQuoteLoading(true);
    getShippingQuotes(shippingMethod, address.region, address.city, controller.signal)
      .then((quotes) => {
        if (controller.signal.aborted) return;
        const quote = quotes.find(item => item.operador === shippingMethod);
        if (!quote) throw new Error('No hay una tarifa disponible para este envío.');
        setShippingQuotes({[shippingMethod]: {...quote, destino: destinationKey}});
        expiry = setTimeout(() => {
          setShippingQuotes({});
          setQuoteError('La cotización venció. Vuelve a cotizar el envío.');
          setQuoteErrorKind('vencida');
        }, Math.max(0, quote.vence_en * 1000 - Date.now()));
      })
      .catch(cause => {
        if (controller.signal.aborted) return;
        setQuoteError(cause instanceof Error ? cause.message : 'No se pudo cotizar el envío.');
        setQuoteErrorKind((cause as {kind?: string} | null)?.kind ?? 'temporal');
      }).finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    return () => { controller.abort(); clearTimeout(expiry); };
  }, [address.city, address.region, shippingMethod, selectedShippingOption, quoteAttempt, destinationKey]);

  useEffect(() => {
    if (
      shippingMethod &&
      !shippingOptions.some(
        (option) => option.id === shippingMethod,
      )
    ) {
      setShippingMethod('');
    }
  }, [shippingMethod, shippingOptions, setShippingMethod]);

  useEffect(() => {
    if (
      paymentMethod &&
      !paymentOptions.some(
        (option) => option.id === paymentMethod,
      )
    ) {
      setPaymentMethod('');
    }
  }, [paymentMethod, paymentOptions]);

  const setTbField = (
    key: keyof CardData,
    value: string,
  ) =>
    setTransbank((current) => ({
      ...current,
      [key]: value,
    }));

  const setMpField = (
    key: keyof CardData,
    value: string,
  ) =>
    setMercadopago((current) => ({
      ...current,
      [key]: value,
    }));

  /*
   * ==========================================================
   * VALIDACIONES
   * ==========================================================
   */
  const validate = (currentStep: string) => {
    const newErrors: Record<string, string> = {};

    if (currentStep === 'contact') {
      if (!availableAuthModes.includes(authMode)) {
        newErrors.auth =
          'Selecciona un metodo de acceso permitido por la tienda.';
      }

      if (!contact.name.trim()) {
        newErrors.name = 'Nombre requerido';
      }

      if (
        !contact.email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          contact.email,
        )
      ) {
        newErrors.email = 'Correo inválido';
      }
    }

    if (currentStep === 'delivery') {
      if (
        selectedShippingOption?.requiresAddress &&
        (!address.street.trim() ||
          !address.number.trim() ||
          !address.city.trim())
      ) {
        newErrors.address =
          'Dirección requerida';
      } else if (
        selectedShippingOption?.requiresAddress &&
        !esComunaDeRegion(address.city, address.region)
      ) {
        newErrors.address =
          'Selecciona una comuna de la región elegida';
      }

      if (shippingLoading || shippingError || !selectedShippingOption) {
        newErrors.shipping =
          'Selecciona un método de entrega';
      } else if (selectedShippingOption.requiresAddress && !deliveryReady) {
        newErrors.shipping = quoteError || 'Espera una cotización válida para continuar.';
      }
    }

    if (currentStep === 'payment') {
      if (paymentsLoading || paymentsError || !paymentOptions.some(option => option.id === paymentMethod)) {
        newErrors.payment =
          'Selecciona un método de pago';
      }
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;

    const index = STEPS.findIndex(
      (item) => item.id === step,
    );

    if (index < STEPS.length - 1) {
      setStep(STEPS[index + 1].id);
    }
  };

  const prev = () => {
    const index = STEPS.findIndex(
      (item) => item.id === step,
    );

    if (index > 0) {
      setStep(STEPS[index - 1].id);
    }
  };

  /*
   * ==========================================================
   * CONFIRMAR PEDIDO
   * ==========================================================
   */
  const handleConfirm = async () => {
    if (submitting.current || loading || !items.length) return;
    if (promoLoading || (checkoutPromoCode && !currentPromotion)) {
      setPromoError('Vuelve a aplicar o quita el código para confirmar el total actualizado.');
      return;
    }
    if (!['contact', 'delivery', 'payment'].every(validate)) return;
    submitting.current = true;
    setLoading(true);
    setErrors({});
    const signature = JSON.stringify({items, contact, paymentMethod, shippingMethod, address, promoCode: checkoutPromoCode});
    if (checkoutAttempt.current.signature !== signature) {
      checkoutAttempt.current = {signature, key: crypto.randomUUID()};
    }
    try {
      if (!['Transbank', 'Linkify', 'Transferencia'].includes(paymentMethod)) {
        throw new Error('Este medio de pago todavía no está disponible para completar la compra.');
      }
      const order = await orderService.create({
        key: checkoutAttempt.current.key, items, contact, paymentMethod, shippingMethod, address, promoCode: checkoutPromoCode,
        shippingQuote: selectedQuote?.cotizacion,
      });

      const orderNumber = String(order.identificador || order.id_pedido);

      if (paymentMethod === 'Transbank') {
        try {
          sessionStorage.setItem(`order-tracking:${orderNumber}`, JSON.stringify({
            identificador: order.identificador, email: contact.email.trim(),
          }));
        } catch {
          // Sin almacenamiento, Seguimiento conserva la búsqueda manual.
        }
        const returnUrl = `${window.location.origin}${route('pedido-confirmado')}?orderNumber=${orderNumber}&tienda=${order.tienda_id}`;
        const result = await transbankPaymentService.iniciarPago(
          order.tienda_id, orderNumber, Number(order.monto_total), returnUrl, contact.email.trim(),
        );
        if (!result.exito || !result.data?.url || !result.data?.token) {
          throw new Error(result.mensaje || `Pedido #${orderNumber} registrado; no se pudo iniciar Webpay. Puedes reintentar.`);
        }
        await clearCart();
        transbankPaymentService.redirigirAWebpay(result.data.url, result.data.token);
        return;
      }

      if (paymentMethod === 'PayPal') {
        const returnUrl = `${window.location.origin}${route('pedido-confirmado')}?orderNumber=${orderNumber}&paypal_success=true`;
        const cancelUrl = `${window.location.origin}${route('checkout')}?paypal_cancel=true`;
        
        const result = await paypalPaymentService.iniciarPago(
          order.tienda_id, orderNumber, Number(order.monto_total), returnUrl, cancelUrl
        );

        if (!result.exito || !result.data?.approve_url) {
          throw new Error(result.mensaje || `Pedido #${orderNumber} registrado; no se pudo conectar con PayPal.`);
        }
        await clearCart();
        window.location.href = result.data.approve_url;
        return;
      }

      if (paymentMethod === 'Linkify') {
        if (!order.url_pago) {
          throw new Error(`Pedido #${orderNumber} registrado, pero no pudimos iniciar el pago con Linkify. Contacta a la tienda para completarlo.`);
        }
        await clearCart();
        window.location.href = order.url_pago;
        return;
      }
      
      await clearCart();
      navigate(route('pedido-confirmado'), {
        state: {orderNumber, identificador: order.identificador, email: contact.email.trim()}, replace: true,
      });
    } catch (error) {
      const code = (error as {code?: string} | null)?.code;
      if (typeof code === 'string' && code.startsWith('COTIZACION_')) {
        // La tarifa venció o cambió: se vuelve a cotizar y se devuelve al comprador a Entrega.
        setQuoteAttempt(value => value + 1);
        setStep('delivery');
        setErrors({shipping: 'La tarifa de envío venció o cambió. La actualizamos: revisa el total y continúa.'});
      } else {
        setErrors({payment: error instanceof Error ? error.message : 'No se pudo registrar el pedido. Intenta nuevamente.'});
      }
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  /*
   * ==========================================================
   * CARRITO VACÍO
   * ==========================================================
   */
  if (items.length === 0) {
    return (
      <div
        className={
          isVisual
            ? 'max-w-[1180px] mx-auto px-5 md:px-8 py-20 text-center font-serif text-3xl'
            : isMinimal
              ? 'max-w-6xl mx-auto px-4 md:px-8 py-20 text-center'
              : 'max-w-7xl mx-auto px-4 py-16 text-center'
        }
      >
        <p>
          Tu carrito está vacío.{' '}

          <Link data-page-action="ghost"
            to={route('catalogo')}
            className="text-[var(--primary)] hover:underline"
          >
            Ir al catálogo
          </Link>
        </p>
      </div>
    );
  }

  const PAYMENT_LABELS: Record<
    string,
    string
  > = {
    Transbank: 'Webpay / Transbank',
    MercadoPago: 'Mercado Pago',
    PayPal: 'PayPal',
    Linkify: 'Linkify',
    Transferencia: 'Transferencia bancaria',
  };

  const paymentLabel =
    PAYMENT_LABELS[paymentMethod] ??
    paymentMethod;

  const paymentDetail =
    paymentMethod === 'Transbank'
      ? `Tarjeta •••• ${last4(
          transbank.number,
        )}`
      : paymentMethod === 'MercadoPago'
        ? `Tarjeta •••• ${last4(
            mercadopago.number,
          )} · ${
            mercadopago.installments
          } cuota${
            mercadopago.installments === '1'
              ? ''
              : 's'
          }`
        : paymentMethod === 'PayPal'
          ? 'Redirección segura a PayPal'
          : paymentMethod ===
              'Transferencia'
            ? transferDetails
              ? `${transferDetails.bank_name} · ${transferDetails.account_type} · ${transferDetails.account_number}`
              : 'Transferencia bancaria'
            : '';

  /*
   * Estilos compartidos para los paneles.
   */
  const panelClass = isVisual
    ? 'bg-[#f1f1f0] rounded-[10px] p-5 sm:p-6 flex flex-col gap-5'
    : isMinimal
      ? 'bg-white border border-black/5 rounded-[24px] p-5 sm:p-6 flex flex-col gap-5'
      : 'bg-white border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5';


  const isPaymentDisabled = loading || promoLoading || (!!checkoutPromoCode && !currentPromotion) || !deliveryReady || (shipping === null && shippingMethod !== 'Retiro');

  return (
    <div
      className={
        isVisual
          ? 'max-w-[1180px] mx-auto px-5 md:px-8 pt-10 pb-14 text-[var(--visual-page-color)]'
          : isMinimal
            ? 'max-w-6xl mx-auto px-4 md:px-8 pt-10 pb-8'
            : 'max-w-5xl mx-auto px-4 py-8'
      }
    >
      {isVisual && (
        <div className="mb-8">
          <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
            Finaliza tu compra
          </p>
          <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
            Checkout
          </h1>
        </div>
      )}

      {isCatalog && (
        <div className="mb-8">
          <p className="text-[var(--primary)] text-[10px] font-black uppercase tracking-[0.16em]">
            Finaliza tu compra
          </p>
          <h1 className="mt-3 text-[42px] md:text-[52px] leading-none tracking-[-0.045em] font-black text-[var(--visual-page-color)]">
            Checkout.
          </h1>
        </div>
      )}

      {/* =====================================================
          TÍTULO MINIMAL
      ====================================================== */}
      {isMinimal && (
        <div className="mb-7">
          <p className="text-xs text-[var(--visual-page-color)] mb-2">
            Finaliza tu compra
          </p>

          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[var(--visual-page-color)]">
            Checkout
          </h1>
        </div>
      )}

      {/* =====================================================
          STEPPER
      ====================================================== */}
      <div data-page-panel
        className={
          isVisual
            ? 'mb-8 overflow-x-auto rounded-[10px] bg-[var(--visual-page-panel-background)] px-4 py-4'
            : isMinimal
              ? 'mb-8 overflow-x-auto pb-2 bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/5 rounded-[20px] px-4 py-4'
              : 'mb-8 overflow-x-auto pb-2'
        }
      >
        <Stepper
          steps={STEPS}
          current={step}
        />
      </div>

      <div
        className={`
          grid grid-cols-1 lg:grid-cols-5
          ${
            isVisual
              ? 'gap-8 lg:gap-12'
              : isMinimal
                ? 'gap-6 lg:gap-8'
                : 'gap-8'
          }
        `}
      >
        {/* =================================================
            FORMULARIO
        ================================================== */}
        <div className="lg:col-span-3">

          {/* ===============================================
              CONTACTO
          ================================================ */}
          {step === 'contact' && (
            <div data-visual-section="pagePanel" data-page-panel className={panelClass}>
              <div>
                {isMinimal && (
                  <p className="text-xs text-[var(--visual-page-color)] mb-1">
                    Paso 1 de 4
                  </p>
                )}

                <h2
                  className={
                    isMinimal
                      ? 'text-xl font-semibold tracking-tight'
                      : 'text-lg font-semibold'
                  }
                >
                  Datos de contacto
                </h2>
              </div>

              <div data-page-panel
                className={
                  isMinimal
                    ? 'flex gap-1 p-1 bg-[var(--visual-page-panel-background)] rounded-full'
                    : 'flex gap-2 p-1 bg-[var(--muted)] rounded-xl'
                }
              >
                {availableAuthModes.map((mode) => (
                  <button data-page-action="choice" aria-pressed={authMode === mode}
                    type="button"
                    key={mode}
                    onClick={() =>
                      setAuthMode(mode)
                    }
                    className={`
                      flex-1 flex items-center
                      justify-center gap-1.5
                      text-xs font-medium
                      transition-all
                      ${
                        isMinimal
                          ? 'py-2.5 rounded-full'
                          : 'py-2 rounded-lg'
                      }
                      ${
                        authMode === mode
                          ? 'bg-[var(--visual-page-panel-background)] shadow-sm text-[var(--visual-page-color)]'
                          : 'text-[var(--visual-page-color)] hover:text-[var(--visual-page-color)]'
                      }
                    `}
                  >
                    <Icon
                      name={
                        mode === 'guest'
                          ? 'user'
                          : mode === 'login'
                            ? 'key'
                            : 'globe'
                      }
                      className="w-3.5 h-3.5"
                    />

                    {mode === 'guest'
                      ? 'Invitado'
                      : mode === 'login'
                        ? 'Ingresar'
                        : 'Google'}
                  </button>
                ))}
              </div>

              {errors.auth && (
                <Alert variant="error">{errors.auth}</Alert>
              )}

              {!availableAuthModes.includes('guest') && (
                <Alert variant="info">
                  La tienda requiere iniciar sesion antes de pagar.
                </Alert>
              )}

              {authMode === 'google' && (
                <button data-page-action="outline"
                  type="button"
                  onClick={() => {
                    setContact({
                      name: 'Cliente Demo',
                      email:
                        'demo@example.com',
                      phone: '',
                    });

                    setErrors({});
                  }}
                  className={
                    isMinimal
                      ? 'flex items-center justify-center gap-3 border border-[var(--border)] rounded-full py-3 text-sm font-medium hover:bg-[var(--muted)] transition-colors'
                      : 'flex items-center justify-center gap-3 border border-[var(--border)] rounded-xl py-3 text-sm font-medium hover:bg-[var(--muted)] transition-colors'
                  }
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>

                  {contact.email ===
                  'demo@example.com'
                    ? 'Cuenta demo seleccionada ✓'
                    : 'Continuar con Google'}
                </button>
              )}

              {authMode !== 'google' && (
                <div className="flex flex-col gap-4">
                  <Input
                    label="Nombre completo"
                    value={contact.name}
                    onChange={(event) =>
                      setContact(
                        (current) => ({
                          ...current,
                          name: event.target.value,
                        }),
                      )
                    }
                    error={errors.name}
                    placeholder="María González"
                    required
                  />

                  <Input
                    label="Correo electrónico"
                    type="email"
                    value={contact.email}
                    onChange={(event) =>
                      setContact(
                        (current) => ({
                          ...current,
                          email:
                            event.target.value,
                        }),
                      )
                    }
                    error={errors.email}
                    placeholder="correo@ejemplo.com"
                    required
                  />

                  <Input
                    label="Teléfono (opcional)"
                    type="tel"
                    value={contact.phone}
                    onChange={(event) =>
                      setContact(
                        (current) => ({
                          ...current,
                          phone:
                            event.target.value,
                        }),
                      )
                    }
                    placeholder="+56 9 1234 5678"
                  />
                </div>
              )}
            </div>
          )}

          {/* ===============================================
              ENTREGA
          ================================================ */}
          {step === 'delivery' && (
            <div data-visual-section="pagePanel" data-page-panel className={panelClass}>
              <div>
                {isMinimal && (
                  <p className="text-xs text-[var(--visual-page-color)] mb-1">
                    Paso 2 de 4
                  </p>
                )}

                <h2
                  className={
                    isCatalog
                      ? 'text-lg font-semibold text-[var(--visual-page-color)]'
                      : isMinimal
                        ? 'text-xl font-semibold tracking-tight'
                        : 'text-lg font-semibold'
                  }
                >
                  Método de entrega
                </h2>
              </div>

              {errors.shipping && (
                <Alert variant="error">
                  {errors.shipping}
                </Alert>
              )}

              {shippingLoading && <LoadingState align="start" spacing="compact">Cargando alternativas de entrega…</LoadingState>}
              {shippingError && <ErrorState onRetry={() => setShippingLoadAttempt(value => value + 1)} retryLabel="Reintentar carga">{shippingError}</ErrorState>}
              {!shippingLoading && !shippingError && !shippingOptions.length && <Alert variant="info">La tienda todavía no tiene alternativas de entrega habilitadas.</Alert>}
              {quoteLoading && <Alert variant="info">Cotizando envío…</Alert>}
              {quoteError && shippingMethod !== 'Retiro' && (
                <div className="flex flex-col gap-3" aria-live="polite">
                  <Alert variant="error">{quoteError}</Alert>
                  {quoteNeedsOtherOption ? (
                    <>
                      <p className="text-xs text-[#667085]">
                        {quoteErrorKind === 'destino'
                          ? 'Revisa la región y la comuna de tu dirección.'
                          : otherShippingOptions.length
                            ? 'Puedes elegir otra alternativa de entrega o cambiar la comuna de tu dirección.'
                            : 'Puedes cambiar la comuna de tu dirección o contactar a la tienda.'}
                      </p>
                      {quoteErrorKind !== 'destino' && otherShippingOptions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {otherShippingOptions.map(option => (
                            <Button key={option.id} variant="outline" onClick={() => setShippingMethod(option.id)}>
                              Usar {option.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => setQuoteAttempt(value => value + 1)}>Volver a cotizar</Button>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3" role="radiogroup" aria-label="Alternativas de entrega">
                {shippingOptions.map((method) => (
                  <div
                    key={method.id}
                    className={`
                      border min-w-0 focus-within:ring-2 focus-within:ring-[var(--primary)]
                      transition-all
                      ${
                        isMinimal
                          ? 'rounded-[18px]'
                          : 'rounded-xl'
                      }
                      ${
                        shippingMethod === method.id
                          ? 'border-[var(--primary)] bg-[var(--secondary)]'
                          : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                      }
                    `}
                  >
                    <label className="flex items-center gap-4 p-4 cursor-pointer">
                    <input
                      type="radio"
                      name="shipping"
                      aria-label={method.label}
                      value={method.id}
                      checked={shippingMethod === method.id}
                      onChange={() => setShippingMethod(method.id)}
                      className="sr-only"
                    />

                    <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center text-[var(--visual-page-color)]">
                      <Icon
                        name={method.icon}
                        className="w-5 h-5"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={isCatalog ? "font-semibold text-sm text-[var(--visual-page-color)]" : "font-semibold text-sm"}>
                        {method.label}
                      </p>

                      <p className="text-xs text-[var(--visual-page-color)] mt-0.5">
                        {method.id !== 'Retiro' && method.id === shippingMethod && selectedQuote
                          ? selectedQuote.plazo_dias
                            ? `${selectedQuote.plazo_dias} dias habiles · Tarifa de la tienda`
                            : 'Despacho a domicilio'
                          : method.desc}
                      </p>
                    </div>

                    <span className="text-sm font-semibold">
                      {method.id !== 'Retiro' && method.id === shippingMethod && selectedQuote
                        ? formatPrice(selectedQuote.monto)
                        : method.id !== 'Retiro' && method.id === shippingMethod && quoteUnavailable
                          ? 'Sin tarifa'
                          : method.priceLabel}
                    </span>
                    </label>
                    {method.id === 'Retiro' && method.pickup && <div className="px-4 pb-3"><PickupDetails pickup={method.pickup} />
                      {method.id === shippingMethod && (
                        <p role="status" className="mt-3 rounded-lg bg-[var(--muted)] p-3 text-xs leading-relaxed">
                          La tienda te informará cuando tu pedido esté listo para retirar.
                          No necesitas seleccionar una fecha ni una hora durante la compra.
                        </p>
                      )}
                    </div>}
                  </div>
                ))}
              </div>

              {shippingMethod &&
                selectedShippingOption?.requiresAddress && (
                  <div className="flex flex-col gap-4 border-t border-[var(--border)] pt-5">
                    <h3 className="text-sm font-semibold">
                      Dirección de entrega
                    </h3>

                    {errors.address && (
                      <Alert variant="error">
                        {errors.address}
                      </Alert>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <Input
                          label="Calle"
                          value={
                            address.street
                          }
                          onChange={(
                            event,
                          ) =>
                            setAddress(
                              (current) => ({
                                ...current,
                                street:
                                  event
                                    .target
                                    .value,
                              }),
                            )
                          }
                          placeholder="Av. Providencia"
                          required
                        />
                      </div>

                      <Input
                        label="Número"
                        value={address.number}
                        onChange={(event) =>
                          setAddress(
                            (current) => ({
                              ...current,
                              number:
                                event.target
                                  .value,
                            }),
                          )
                        }
                        placeholder="1234"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select
                        label="Región"
                        value={address.region}
                        onChange={(event) =>
                          setAddress(
                            (current) => ({
                              ...current,
                              region:
                                event.target
                                  .value,
                              city: '',
                            }),
                          )
                        }
                        options={REGIONES}
                      />

                      <Select
                        label="Comuna"
                        value={address.city}
                        onChange={(event) =>
                          setAddress(
                            (current) => ({
                              ...current,
                              city:
                                event.target
                                  .value,
                            }),
                          )
                        }
                        options={[
                          { value: '', label: 'Selecciona una comuna' },
                          ...comunasDeRegion(address.region).map(
                            (comuna) => ({
                              value: comuna,
                              label: comuna,
                            }),
                          ),
                        ]}
                      />
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* ===============================================
              PAGO
          ================================================ */}
          {step === 'payment' && (
            <div data-visual-section="pagePanel" data-page-panel className={panelClass}>
              <div>
                {isMinimal && (
                  <p className="text-xs text-[var(--visual-page-color)] mb-1">
                    Paso 3 de 4
                  </p>
                )}

                <h2
                  className={
                    isCatalog
                      ? 'text-lg font-semibold text-[var(--visual-page-color)]'
                      : isMinimal
                        ? 'text-xl font-semibold tracking-tight'
                        : 'text-lg font-semibold'
                  }
                >
                  Método de pago
                </h2>
              </div>

              {errors.payment && (
                <Alert variant="error">
                  {errors.payment}
                </Alert>
              )}

              {paymentsLoading ? (
                <LoadingState align="start" spacing="compact">Cargando medios de pago…</LoadingState>
              ) : paymentsError ? (
                <Alert variant="error">{paymentsError}</Alert>
              ) : paymentOptions.length === 0 ? (
                <Alert variant="error">
                  La tienda no tiene medios de pago habilitados en este momento. Por favor, comunícate con el administrador.
                </Alert>
              ) : (
                <div className="grid gap-4">
                  {paymentOptions.map((payment) => (
                    <label
                      key={payment.id}
                      className={`flex items-center gap-4 p-4 border cursor-pointer transition-all ${
                        isMinimal ? 'rounded-[18px]' : 'rounded-xl'
                      } ${
                        paymentMethod === payment.id
                          ? 'border-[var(--primary)] bg-[var(--secondary)]'
                          : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value={payment.id}
                        checked={paymentMethod === payment.id}
                        onChange={() => setPaymentMethod(payment.id)}
                        className="sr-only"
                      />
                      <span className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center text-[var(--visual-page-color)]">
                        <Icon name={payment.icon} className="w-5 h-5" />
                      </span>
                      <div className="flex-1">
                        <p className={isCatalog ? "font-semibold text-sm text-[var(--visual-page-color)]" : "font-semibold text-sm"}>
                          {payment.label}
                        </p>
                        <p className="text-xs text-[var(--visual-page-color)] mt-0.5">{payment.desc}</p>
                      </div>
                      {paymentMethod === payment.id && (
                        <span className={isCatalog ? "text-[var(--primary)] text-lg" : "text-[var(--primary)] text-lg"}>OK</span>
                      )}
                    </label>
                  ))}
                </div>
              )}

              {/* TRANSBANK */}
              {paymentMethod === 'Transbank' && (
                <div data-page-panel
                  className={
                    isMinimal
                      ? 'border border-[var(--border)] rounded-[18px] p-5 bg-[var(--visual-page-panel-background)] flex flex-col gap-4 animate-fade-in'
                      : 'border border-[var(--border)] rounded-xl p-5 bg-[var(--muted)]/40 flex flex-col gap-4 animate-fade-in'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--visual-page-color)] flex items-center justify-center">
                      <Icon
                        name="card"
                        className="w-4 h-4"
                      />
                    </span>

                    <div>
                      <p className="font-semibold text-sm">
                        Pagar con Webpay Plus
                      </p>

                      <p className="text-xs text-[var(--visual-page-color)]">
                        Redirección al portal seguro de Transbank · Débito, Crédito y Prepago
                      </p>
                    </div>
                  </div>

                  <Select
                    label="Tipo de tarjeta preferida"
                    value={transbank.cardType}
                    onChange={(event) =>
                      setTransbank((current) => ({
                        ...current,
                        cardType: event.target.value,
                      }))
                    }
                    options={[
                      { value: 'credito', label: 'Crédito' },
                      { value: 'debito', label: 'Débito' },
                      { value: 'prepago', label: 'Prepago' },
                    ]}
                  />

                  <CardFields
                    prefix="tb"
                    data={transbank}
                    onField={setTbField}
                    errors={errors}
                  />

                  <Input
                    readOnly
                    label="RUT del titular"
                    value={transbank.rut}
                    onChange={(event) =>
                      setTransbank((current) => ({
                        ...current,
                        rut: event.target.value,
                      }))
                    }
                    placeholder="12.345.678-9"
                    error={errors.tbRut}
                  />

                  <p className="flex items-center gap-1.5 text-xs text-[var(--visual-page-color)]">
                    <Icon
                      name="lock"
                      className="w-3.5 h-3.5"
                    />
                    Al presionar confirmar serás redirigido a Webpay para ingresar tus datos reales de forma segura.
                  </p>
                </div>
              )}

              {/* MERCADO PAGO */}
              {paymentMethod === 'MercadoPago' && (
                <div data-page-panel
                  className={
                    isMinimal
                      ? 'border border-[var(--border)] rounded-[18px] p-5 bg-[var(--visual-page-panel-background)] flex flex-col gap-4 animate-fade-in'
                      : 'border border-[var(--border)] rounded-xl p-5 bg-[var(--muted)]/40 flex flex-col gap-4 animate-fade-in'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] flex items-center justify-center">
                      <Icon
                        name="wallet"
                        className="w-4 h-4"
                      />
                    </span>

                    <div>
                      <p className="font-semibold text-sm">
                        Pagar con Mercado Pago
                      </p>

                      <p className="text-xs text-[var(--visual-page-color)]">
                        Tarjeta o saldo de tu cuenta Mercado Pago
                      </p>
                    </div>
                  </div>

                  <CardFields
                    prefix="mp"
                    data={mercadopago}
                    onField={setMpField}
                    errors={errors}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      label="Cuotas"
                      value={mercadopago.installments}
                      onChange={(event) =>
                        setMercadopago((current) => ({
                          ...current,
                          installments: event.target.value,
                        }))
                      }
                      options={[
                        { value: '1', label: '1 cuota (sin interés)' },
                        { value: '3', label: '3 cuotas' },
                        { value: '6', label: '6 cuotas' },
                        { value: '12', label: '12 cuotas' },
                      ]}
                    />

                    <Input
                      readOnly
                      label="Correo de Mercado Pago (opcional)"
                      type="email"
                      value={mercadopago.email}
                      onChange={(event) =>
                        setMercadopago((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="tu@correo.com"
                    />
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-[var(--visual-page-color)]">
                    <Icon
                      name="lock"
                      className="w-3.5 h-3.5"
                    />
                    Demostración sin conexión a Mercado Pago.
                  </p>
                </div>
              )}

              {/* PAYPAL */}
              {paymentMethod === 'PayPal' && (
                <div data-page-panel
                  className={
                    isMinimal
                      ? 'border border-[var(--border)] rounded-[18px] p-5 bg-[var(--visual-page-panel-background)] flex flex-col gap-4 animate-fade-in'
                      : 'border border-[var(--border)] rounded-xl p-5 bg-[var(--muted)]/40 flex flex-col gap-4 animate-fade-in'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] flex items-center justify-center">
                      <Icon
                        name="card"
                        className="w-4 h-4"
                      />
                    </span>

                    <div>
                      <p className="font-semibold text-sm">
                        Pagar con PayPal
                      </p>

                      <p className="text-xs text-[var(--visual-page-color)]">
                        Serás redirigido a PayPal de forma segura para autorizar el pago
                      </p>
                    </div>
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-[var(--visual-page-color)]">
                    <Icon
                      name="lock"
                      className="w-3.5 h-3.5"
                    />
                    Al presionar confirmar saldrás temporalmente de la tienda para ingresar tus datos reales.
                  </p>
                </div>
              )}

              {/* TRANSFERENCIA */}
              {paymentMethod === 'Transferencia' && transferDetails && (
                <div data-page-panel
                  className={
                    isMinimal
                      ? 'bg-[var(--info-bg)] border border-[var(--info)] rounded-[18px] p-5 text-sm space-y-3'
                      : 'bg-[var(--info-bg)] border border-[var(--info)] rounded-xl p-4 text-sm space-y-3'
                  }
                >
                  <div>
                    <p className="font-semibold text-[var(--info)]">
                      Datos para realizar la transferencia
                    </p>
                    <p className="text-xs text-[var(--visual-page-color)] mt-1">
                      Transfiere el monto exacto a la cuenta configurada por esta tienda.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-[var(--visual-page-color)]">
                    <span className="text-[var(--visual-page-color)]">Banco:</span>
                    <span>{transferDetails.bank_name}</span>

                    <span className="text-[var(--visual-page-color)]">Tipo de cuenta:</span>
                    <span>{transferDetails.account_type}</span>

                    <span className="text-[var(--visual-page-color)]">N° de cuenta:</span>
                    <span>{transferDetails.account_number}</span>

                    <span className="text-[var(--visual-page-color)]">Titular:</span>
                    <span>{transferDetails.holder_name}</span>

                    <span className="text-[var(--visual-page-color)]">RUT:</span>
                    <span>{transferDetails.holder_rut}</span>

                    <span className="text-[var(--visual-page-color)]">Correo comprobante:</span>
                    <span>{transferDetails.confirmation_email}</span>

                    <span className="text-[var(--visual-page-color)]">Monto:</span>
                    <span data-page-price className="font-bold">{formatPrice(total)}</span>
                  </div>

                  <Alert variant="info">
                    El pago se realiza directamente a la cuenta bancaria informada por el emprendedor.
                    El pedido quedará registrado para su posterior verificación.
                  </Alert>
                </div>
              )}
            </div>
          )}

          {/* ===============================================
              CONFIRMAR
          ================================================ */}
          {step === 'confirm' && (
            <div data-visual-section="pagePanel" data-page-panel className={panelClass}>
              <div>
                {isMinimal && (
                  <p className="text-xs text-[var(--visual-page-color)] mb-1">
                    Paso 4 de 4
                  </p>
                )}

                                <h2
                  className={
                    isMinimal
                      ? 'text-xl font-semibold tracking-tight'
                      : 'text-lg font-semibold'
                  }
                >
                  Confirmar pedido
                </h2>
              </div>

              {errors.submit && (
                <Alert variant="error">{errors.submit}</Alert>
              )}
              {!deliveryReady && <Alert variant="error">{quoteError || 'Vuelve a entrega para obtener una cotización válida.'}</Alert>}

              {errors.payment && (
                <Alert variant="error">
                  {errors.payment}
                </Alert>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div data-page-panel
                  className={
                    isMinimal
                      ? 'bg-[var(--visual-page-panel-background)] rounded-[18px] p-4'
                      : 'bg-[var(--muted)] rounded-xl p-4'
                  }
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--visual-page-color)] mb-2">
                    Contacto
                  </p>

                  <p className={isCatalog ? "font-medium text-[var(--visual-page-color)]" : "font-medium"}>
                    {contact.name}
                  </p>

                  <p className="text-[var(--visual-page-color)]">
                    {contact.email}
                  </p>
                </div>

                <div data-page-panel
                  className={
                    isMinimal
                      ? 'bg-[var(--visual-page-panel-background)] rounded-[18px] p-4'
                      : 'bg-[var(--muted)] rounded-xl p-4'
                  }
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--visual-page-color)] mb-2">
                    Entrega
                  </p>

                  <p className={isCatalog ? "font-medium text-[var(--visual-page-color)]" : "font-medium"}>
                    {shippingMethod}
                  </p>
                  {shippingMethod === 'Retiro' && (
                    <p className="mt-2 text-xs text-[var(--visual-page-color)]">
                      Retiro sin costo. La tienda te informará cuando tu pedido esté listo.
                    </p>
                  )}

                  {selectedShippingOption?.requiresAddress && (
                    <p className="text-[var(--visual-page-color)] text-xs mt-0.5">
                      {address.street}{' '}
                      {address.number},{' '}
                      {address.city}
                    </p>
                  )}
                </div>
              </div>

              <div data-page-panel
                className={
                  isMinimal
                    ? 'bg-[var(--visual-page-panel-background)] rounded-[18px] p-4 text-sm'
                    : 'bg-[var(--muted)] rounded-xl p-4 text-sm'
                }
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--visual-page-color)] mb-2">
                  Pago
                </p>

                <p className={isCatalog ? "font-medium text-[var(--visual-page-color)]" : "font-medium"}>
                  {paymentLabel}
                </p>

                {paymentDetail && (
                  <p className="text-[var(--visual-page-color)] text-xs mt-0.5">
                    {paymentDetail}
                  </p>
                )}
              </div>

              <Alert variant="info">
                Al confirmar aceptas nuestras{' '}
                <Link data-page-action="ghost"
                  to={route('legal/terms')}
                  className="font-semibold underline"
                  target="_blank"
                >
                  condiciones de uso
                </Link>
                , nuestra{' '}
                <Link data-page-action="ghost"
                  to={route('legal/privacy')}
                  className="font-semibold underline"
                  target="_blank"
                >
                  política de privacidad
                </Link>{' '}
                y nuestra{' '}
                <Link data-page-action="ghost"
                  to={route('legal/refund')}
                  className="font-semibold underline"
                  target="_blank"
                >
                  política de reembolso
                </Link>
                .
              </Alert>
            </div>
          )}

          {/* ===============================================
              NAVEGACIÓN
          ================================================ */}
          <div className="flex justify-between items-center gap-3 mt-5">
            {step !== 'contact' ? (
              isVisual ? (
                <button data-page-action="primary"
                  type="button"
                  onClick={prev}
                  className="h-11 px-5 rounded-[8px] border border-[var(--visual-global-border)] bg-[var(--visual-page-panel-background)] text-[11px] font-semibold hover:bg-[var(--visual-page-panel-background)] hover:text-[var(--visual-page-color)] transition-colors"
                >
                  ← Volver
                </button>
              ) : isMinimal ? (
                <button data-page-action="outline"
                  type="button"
                  onClick={prev}
                  className="h-11 px-5 rounded-full border border-[var(--border)] bg-[var(--visual-page-panel-background)] text-sm font-semibold hover:bg-[var(--muted)] transition-colors"
                >
                  ← Volver
                </button>
              ) : (
                <Button
                  variant="outline"
                  onClick={prev}
                >
                  ← Volver
                </Button>
              )
            ) : (
              <div />
            )}

            {step === 'confirm' ? (
              isVisual ? (
                <button data-page-action="primary"
                  type="button"
                  disabled={isPaymentDisabled}
                  onClick={handleConfirm}
                  className="min-h-12 px-6 rounded-[8px] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] text-[12px] font-semibold hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  {loading ? 'Registrando pedido...' : `Confirmar y pagar ${formatPrice(total)}`}
                </button>
              ) : isMinimal ? (
                <button data-page-action="primary"
                  type="button"
                  disabled={isPaymentDisabled}
                  onClick={handleConfirm}
                  className="min-h-12 px-6 rounded-full bg-[var(--primary)] text-[var(--visual-page-color)] text-sm font-semibold hover:bg-[var(--primary)] disabled:opacity-50 transition-colors"
                >
                  {loading
                    ? 'Registrando pedido...'
                    : `Confirmar y pagar ${formatPrice(total)}`}
                </button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  disabled={isPaymentDisabled}
                  onClick={handleConfirm}
                >
                  {loading ? 'Registrando pedido...' : `Confirmar y pagar ${formatPrice(total)}`}
                </Button>
              )
            ) : isVisual ? (
              <button data-page-action="primary"
                type="button"
                onClick={next}
                className="h-11 px-6 rounded-[8px] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] text-[12px] font-semibold hover:opacity-80 transition-opacity"
              >
                Continuar →
              </button>
            ) : isMinimal ? (
              <button data-page-action="primary"
                type="button"
                onClick={next}
                className="h-11 px-6 rounded-full bg-[var(--primary)] text-[var(--visual-page-color)] text-sm font-semibold hover:bg-[var(--primary)] transition-colors"
              >
                Continuar →
              </button>
            ) : (
              <Button
                variant="primary"
                onClick={next}
              >
                Continuar →
              </Button>
            )}
          </div>
        </div>

        {/* =================================================
            RESUMEN DEL PEDIDO
        ================================================== */}
        <aside data-visual-section="pagePanel" className="lg:col-span-2">
          <div data-page-panel
            className={
              isVisual
                ? 'bg-[var(--visual-page-panel-background)] rounded-[10px] p-5 md:p-6 sticky top-24'
                : isMinimal
                  ? 'bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/5 rounded-[24px] p-5 sticky top-24'
                  : 'bg-[var(--visual-page-panel-background)] border border-[var(--border)] rounded-2xl p-5 sticky top-24'
            }
          >
            <h3
              className={
                isMinimal
                  ? 'font-semibold text-lg tracking-tight mb-5'
                  : 'font-semibold mb-4 text-sm uppercase tracking-wider text-[var(--visual-page-color)]'
              }
            >
              Tu pedido
            </h3>

            <div className="flex flex-col gap-4 mb-5">
              {items.map((item) => (
                <div
                  key={`${item.productId}-${item.variantId}`}
                  className="flex items-center gap-3"
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={item.image}
                      alt={item.name}
                      className={
                        isVisual
                          ? 'w-14 h-14 rounded-[8px] object-cover bg-[#e7e7e4]'
                          : isMinimal
                            ? 'w-14 h-14 rounded-xl object-cover bg-[var(--muted)]'
                            : 'w-12 h-12 rounded-lg object-cover bg-[var(--muted)]'
                      }
                    />

                    <span className={`absolute -top-1.5 -right-1.5 w-5 h-5 text-[var(--visual-page-color)] text-[10px] rounded-full flex items-center justify-center font-bold ${
                        isVisual ? 'bg-[var(--visual-page-panel-background)]' : 'bg-[var(--primary)]'
                      }`}>
                      {item.quantity}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={
                        isMinimal
                          ? 'text-sm font-medium truncate'
                          : 'text-xs font-medium truncate'
                      }
                    >
                      {item.name}
                    </p>

                    <p className="text-xs text-[var(--visual-page-color)] mt-0.5">
                      {Object.values(item.attributes).join(' / ')}
                    </p>
                  </div>

                  <div className="text-right">
                    {item.comparePrice !== undefined && item.comparePrice > item.price && (
                      <p
                        data-page-price
                        className="text-[10px] text-[var(--visual-page-color)] line-through"
                        aria-label={`Precio original ${formatPrice(item.comparePrice * item.quantity)}`}
                      >
                        {formatPrice(item.comparePrice * item.quantity)}
                      </p>
                    )}

                    <p data-page-price className="text-xs font-semibold">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] pt-4 flex flex-col gap-3 text-sm">
              <div className="pb-4 border-b border-[var(--border)]">
                <label htmlFor="checkout-promo-code" className="block text-xs font-semibold uppercase tracking-wider text-[var(--visual-page-color)] mb-2">
                  Código promocional
                </label>
                <div className="flex gap-2">
                  <input
                    id="checkout-promo-code"
                    value={promoInput}
                    onChange={event => setPromoInput(event.target.value.toUpperCase())}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void handleApplyPromotion(); } }}
                    placeholder="Ej: VERANO20"
                    autoComplete="off"
                    className="h-10 flex-1 min-w-0 rounded-lg border border-[var(--border)] bg-transparent px-3 text-sm outline-none"
                  />
                  <Button type="button" variant="secondary" disabled={promoLoading} onClick={() => void handleApplyPromotion()}>
                    {promoLoading ? 'Validando...' : 'Aplicar'}
                  </Button>
                  {(checkoutPromoCode || validatedPromotion) && <Button type="button" variant="secondary" onClick={() => {
                    promotionRequest.current += 1; applyingPromotion.current = false; setPromoLoading(false);
                    setCheckoutPromoCode(''); setPromoInput(''); setValidatedPromotion(null); setPromoError(''); setPromoMessage('Promoción eliminada.');
                    removePromo?.();
                  }}>Quitar</Button>}
                </div>
                {promoError && <p role="alert" className="mt-2 text-xs text-[var(--error)]">{promoError}</p>}
                {promoMessage && <p role="status" className="mt-2 text-xs text-[var(--success)]">{promoMessage}</p>}
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--visual-page-color)]">
                  Subtotal
                </span>

                <span data-page-price>
                  {formatPrice(subtotal)}
                </span>
              </div>

              {effectiveDiscount > 0 && (
                <div className="flex justify-between text-[var(--success)]">
                  <span>Descuento{checkoutPromoCode ? ` (${checkoutPromoCode})` : ''}</span>

                  <span>
                    −{formatPrice(effectiveDiscount)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-[var(--visual-page-color)]">Envío</span>
                <span className="font-medium">
                  {shipping === null ? 'Por cotizar' : shipping === 0 ? 'Gratis ($0)' : formatPrice(shipping)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-[var(--border)]">
                <span>{shipping === null ? 'Total parcial' : 'Total'}</span>
                <span data-page-price>{formatPrice(total)}</span>
              </div>
            </div>

            {(isMinimal || isVisual) && (
              <Link data-page-action="ghost"
                to={route('carrito')}
                className={
                  isVisual
                    ? 'block text-center text-[10px] uppercase tracking-[0.12em] text-[var(--visual-page-color)] hover:text-[var(--visual-page-color)] mt-5 transition-colors'
                    : 'block text-center text-xs text-[var(--visual-page-color)] hover:text-[var(--primary)] mt-5 transition-colors'
                }
              >
                ← Editar carrito
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
