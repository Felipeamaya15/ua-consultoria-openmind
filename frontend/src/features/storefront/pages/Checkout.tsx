import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { useOrders } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../data/mockData';
import {
  Stepper,
  Button,
  Input,
  Select,
  Alert,
  Icon,
} from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

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
    discount,
    shipping,
    total,
    clearCart,
    shippingMethod,
    setShippingMethod,
  } = useCart();

  const { addOrder } = useOrders();

  const { route, isMinimal, isVisual, isCatalog } =
    useStorefrontTemplate();

  const navigate = useNavigate();

  const [step, setStep] = useState('contact');

  const [authMode, setAuthMode] =
    useState<AuthMode>('guest');

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

  const [paypal, setPaypal] = useState({
    email: 'demo@example.com',
    password: 'demostracion',
  });

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
        shippingMethod !== 'Retiro' &&
        (!address.street.trim() ||
          !address.number.trim() ||
          !address.city.trim())
      ) {
        newErrors.address =
          'Dirección requerida';
      }

      if (!shippingMethod) {
        newErrors.shipping =
          'Selecciona un método de entrega';
      }
    }

    if (currentStep === 'payment') {
      if (!paymentMethod) {
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
  const handleConfirm = () => {
    if (loading || !items.length) return;

    setLoading(true);

    const orderNumber =
      `ORD-DEMO-${crypto
        .randomUUID()
        .slice(0, 8)
        .toUpperCase()}`;

    const now = new Date().toISOString();

    addOrder({
      id: orderNumber,
      number: orderNumber,

      customer: {
        ...contact,
        email: contact.email.trim(),
      },

      items: items.map((item) => ({
        ...item,
      })),

      subtotal,
      discount,
      shipping,
      total,

      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod,
      shippingMethod,
      address,

      createdAt: now,
      updatedAt: now,
    });

    clearCart();

    navigate(route('pedido-confirmado'), {
      state: {
        orderNumber,
        email: contact.email.trim(),
      },
      replace: true,
    });
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

          <Link
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
          ? paypal.email
          : paymentMethod ===
              'Transferencia'
            ? 'Verificación manual en 24-48h'
            : '';

  /*
   * Estilos compartidos para los paneles.
   */
  const panelClass = isVisual
    ? 'bg-[#f1f1f0] rounded-[10px] p-5 sm:p-6 flex flex-col gap-5'
    : isMinimal
      ? 'bg-white border border-black/5 rounded-[24px] p-5 sm:p-6 flex flex-col gap-5'
      : 'bg-white border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5';

  return (
    <div
      className={
        isVisual
          ? 'max-w-[1180px] mx-auto px-5 md:px-8 pt-10 pb-14 text-[#111111]'
          : isMinimal
            ? 'max-w-6xl mx-auto px-4 md:px-8 pt-10 pb-8'
            : 'max-w-5xl mx-auto px-4 py-8'
      }
    >
      {isVisual && (
        <div className="mb-8">
          <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]">
            Finaliza tu compra
          </p>
          <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
            Checkout
          </h1>
        </div>
      )}

      {isCatalog && (
        <div className="mb-8">
          <p className="text-[#ff5a1f] text-[10px] font-black uppercase tracking-[0.16em]">
            Finaliza tu compra
          </p>
          <h1 className="mt-3 text-[42px] md:text-[52px] leading-none tracking-[-0.045em] font-black text-white">
            Checkout.
          </h1>
        </div>
      )}

      {/* =====================================================
          TÍTULO MINIMAL
      ====================================================== */}
      {isMinimal && (
        <div className="mb-7">
          <p className="text-xs text-gray-400 mb-2">
            Finaliza tu compra
          </p>

          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]">
            Checkout
          </h1>
        </div>
      )}

      {/* =====================================================
          STEPPER
      ====================================================== */}
      <div
        className={
          isVisual
            ? 'mb-8 overflow-x-auto rounded-[10px] bg-[#f1f1f0] px-4 py-4'
            : isMinimal
              ? 'mb-8 overflow-x-auto pb-2 bg-white border border-black/5 rounded-[20px] px-4 py-4'
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
            <div className={panelClass}>
              <div>
                {isMinimal && (
                  <p className="text-xs text-gray-400 mb-1">
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

              <div
                className={
                  isMinimal
                    ? 'flex gap-1 p-1 bg-[#f4f4f2] rounded-full'
                    : 'flex gap-2 p-1 bg-[var(--muted)] rounded-xl'
                }
              >
                {(
                  [
                    'guest',
                    'login',
                    'google',
                  ] as AuthMode[]
                ).map((mode) => (
                  <button
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
                          ? 'bg-white shadow-sm text-[#151515]'
                          : 'text-[#667085] hover:text-[#151515]'
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

              {authMode === 'google' && (
                <button
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
            <div className={panelClass}>
              <div>
                {isMinimal && (
                  <p className="text-xs text-gray-400 mb-1">
                    Paso 2 de 4
                  </p>
                )}

                <h2
                  className={
                    isCatalog
                      ? 'text-lg font-semibold text-[#151515]'
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

              <div className="flex flex-col gap-3">
                {[
                  'Chilexpress',
                  'Starken',
                  'Retiro',
                ].map((method) => (
                  <label
                    key={method}
                    className={`
                      flex items-center gap-4
                      p-4 border cursor-pointer
                      transition-all
                      ${
                        isMinimal
                          ? 'rounded-[18px]'
                          : 'rounded-xl'
                      }
                      ${
                        shippingMethod ===
                        method
                          ? 'border-[var(--primary)] bg-[var(--secondary)]'
                          : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="shipping"
                      value={method}
                      checked={
                        shippingMethod ===
                        method
                      }
                      onChange={() =>
                        setShippingMethod(
                          method,
                        )
                      }
                      className="sr-only"
                    />

                    <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center text-[#667085]">
                      <Icon
                        name={
                          method ===
                          'Chilexpress'
                            ? 'box'
                            : method ===
                                'Starken'
                              ? 'truck'
                              : 'store'
                        }
                        className="w-5 h-5"
                      />
                    </div>

                    <div className="flex-1">
                      <p className={isCatalog ? "font-semibold text-sm text-[#151515]" : "font-semibold text-sm"}>
                        {method === 'Retiro'
                          ? 'Retiro en tienda'
                          : method}
                      </p>

                      <p className="text-xs text-[#667085] mt-0.5">
                        {method === 'Retiro'
                          ? 'Sin costo · Lun-Sáb 9:00-18:00'
                          : '3-5 días hábiles · $3.490'}
                      </p>
                    </div>

                    <span className="text-sm font-semibold">
                      {method === 'Retiro'
                        ? 'Gratis'
                        : '$3.490'}
                    </span>
                  </label>
                ))}
              </div>

              {shippingMethod &&
                shippingMethod !==
                  'Retiro' && (
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
                      <Input
                        label="Ciudad / Comuna"
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
                        placeholder="Santiago"
                      />

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
                            }),
                          )
                        }
                        options={REGIONES}
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
            <div className={panelClass}>
              <div>
                {isMinimal && (
                  <p className="text-xs text-gray-400 mb-1">
                    Paso 3 de 4
                  </p>
                )}

                <h2
                  className={
                    isCatalog
                      ? 'text-lg font-semibold text-[#151515]'
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

              <div className="flex flex-col gap-3">
                {[
                  {
                    id: 'Transbank',
                    label:
                      'Webpay / Transbank',
                    icon: 'card',
                    desc: 'Tarjeta débito, crédito o prepago',
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
                    label:
                      'Transferencia bancaria',
                    icon: 'bank',
                    desc: 'Verificación manual en 24-48h',
                  },
                ].map((payment) => (
                  <label
                    key={payment.id}
                    className={`
                      flex items-center gap-4
                      p-4 border cursor-pointer
                      transition-all
                      ${
                        isMinimal
                          ? 'rounded-[18px]'
                          : 'rounded-xl'
                      }
                      ${
                        paymentMethod ===
                        payment.id
                          ? 'border-[var(--primary)] bg-[var(--secondary)]'
                          : 'border-[var(--border)] hover:border-[var(--muted-foreground)]'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={payment.id}
                      checked={
                        paymentMethod ===
                        payment.id
                      }
                      onChange={() =>
                        setPaymentMethod(
                          payment.id,
                        )
                      }
                      className="sr-only"
                    />

                    <span className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center text-[#667085]">
                      <Icon
                        name={payment.icon}
                        className="w-5 h-5"
                      />
                    </span>

                    <div className="flex-1">
                      <p className={isCatalog ? "font-semibold text-sm text-[#151515]" : "font-semibold text-sm"}>
                        {payment.label}
                      </p>

                      <p className="text-xs text-[#667085] mt-0.5">
                        {payment.desc}
                      </p>
                    </div>

                    {paymentMethod ===
                      payment.id && (
                      <span className={isCatalog ? "text-[#1683ff] text-lg" : "text-[var(--primary)] text-lg"}>
                        ✓
                      </span>
                    )}
                  </label>
                ))}
              </div>

              {/* TRANSBANK */}
              {paymentMethod ===
                'Transbank' && (
                <div
                  className={
                    isMinimal
                      ? 'border border-[var(--border)] rounded-[18px] p-5 bg-[#f7f7f5] flex flex-col gap-4 animate-fade-in'
                      : 'border border-[var(--border)] rounded-xl p-5 bg-[var(--muted)]/40 flex flex-col gap-4 animate-fade-in'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center">
                      <Icon
                        name="card"
                        className="w-4 h-4"
                      />
                    </span>

                    <div>
                      <p className="font-semibold text-sm">
                        Pagar con Webpay
                      </p>

                      <p className="text-xs text-[#667085]">
                        Demostración con datos
                        ficticios · Sin cobros
                      </p>
                    </div>
                  </div>

                  <Select
                    label="Tipo de tarjeta"
                    value={
                      transbank.cardType
                    }
                    onChange={(event) =>
                      setTransbank(
                        (current) => ({
                          ...current,
                          cardType:
                            event.target
                              .value,
                        }),
                      )
                    }
                    options={[
                      {
                        value: 'credito',
                        label: 'Crédito',
                      },
                      {
                        value: 'debito',
                        label: 'Débito',
                      },
                      {
                        value: 'prepago',
                        label: 'Prepago',
                      },
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
                      setTransbank(
                        (current) => ({
                          ...current,
                          rut: event.target.value,
                        }),
                      )
                    }
                    placeholder="12.345.678-9"
                    error={errors.tbRut}
                  />

                  <p className="flex items-center gap-1.5 text-xs text-[#667085]">
                    <Icon
                      name="lock"
                      className="w-3.5 h-3.5"
                    />
                    Datos de ejemplo. Este
                    formulario no procesa
                    pagos.
                  </p>
                </div>
              )}

              {/* MERCADO PAGO */}
              {paymentMethod ===
                'MercadoPago' && (
                <div
                  className={
                    isMinimal
                      ? 'border border-[var(--border)] rounded-[18px] p-5 bg-[#f7f7f5] flex flex-col gap-4 animate-fade-in'
                      : 'border border-[var(--border)] rounded-xl p-5 bg-[var(--muted)]/40 flex flex-col gap-4 animate-fade-in'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[#009ee3] text-white flex items-center justify-center">
                      <Icon
                        name="wallet"
                        className="w-4 h-4"
                      />
                    </span>

                    <div>
                      <p className="font-semibold text-sm">
                        Pagar con Mercado Pago
                      </p>

                      <p className="text-xs text-[#667085]">
                        Tarjeta o saldo de tu
                        cuenta Mercado Pago
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
                      value={
                        mercadopago.installments
                      }
                      onChange={(event) =>
                        setMercadopago(
                          (current) => ({
                            ...current,
                            installments:
                              event.target
                                .value,
                          }),
                        )
                      }
                      options={[
                        {
                          value: '1',
                          label:
                            '1 cuota (sin interés)',
                        },
                        {
                          value: '3',
                          label: '3 cuotas',
                        },
                        {
                          value: '6',
                          label: '6 cuotas',
                        },
                        {
                          value: '12',
                          label: '12 cuotas',
                        },
                      ]}
                    />

                    <Input
                      readOnly
                      label="Correo de Mercado Pago (opcional)"
                      type="email"
                      value={
                        mercadopago.email
                      }
                      onChange={(event) =>
                        setMercadopago(
                          (current) => ({
                            ...current,
                            email:
                              event.target
                                .value,
                          }),
                        )
                      }
                      placeholder="tu@correo.com"
                    />
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-[#667085]">
                    <Icon
                      name="lock"
                      className="w-3.5 h-3.5"
                    />
                    Demostración sin conexión a
                    Mercado Pago.
                  </p>
                </div>
              )}

              {/* PAYPAL */}
              {paymentMethod ===
                'PayPal' && (
                <div
                  className={
                    isMinimal
                      ? 'border border-[var(--border)] rounded-[18px] p-5 bg-[#f7f7f5] flex flex-col gap-4 animate-fade-in'
                      : 'border border-[var(--border)] rounded-xl p-5 bg-[var(--muted)]/40 flex flex-col gap-4 animate-fade-in'
                  }
                >
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[#003087] text-white flex items-center justify-center">
                      <Icon
                        name="card"
                        className="w-4 h-4"
                      />
                    </span>

                    <div>
                      <p className="font-semibold text-sm">
                        Iniciar sesión en PayPal
                      </p>

                      <p className="text-xs text-[#667085]">
                        Simulación con una
                        cuenta ficticia
                      </p>
                    </div>
                  </div>

                  <Input
                    label="Correo electrónico de PayPal"
                    type="email"
                    value={paypal.email}
                    onChange={(event) =>
                      setPaypal(
                        (current) => ({
                          ...current,
                          email:
                            event.target
                              .value,
                        }),
                      )
                    }
                    placeholder="tu@correo.com"
                    readOnly
                    autoComplete="off"
                    error={errors.ppEmail}
                  />

                  <Input
                    label="Contraseña de PayPal"
                    type="password"
                    value={paypal.password}
                    onChange={(event) =>
                      setPaypal(
                        (current) => ({
                          ...current,
                          password:
                            event.target
                              .value,
                        }),
                      )
                    }
                    placeholder="••••••••"
                    readOnly
                    autoComplete="off"
                    error={
                      errors.ppPassword
                    }
                  />

                  <p className="flex items-center gap-1.5 text-xs text-[#667085]">
                    <Icon
                      name="lock"
                      className="w-3.5 h-3.5"
                    />
                    Cuenta ficticia de
                    demostración. No se conecta
                    a PayPal.
                  </p>
                </div>
              )}

              {/* TRANSFERENCIA */}
              {paymentMethod ===
                'Transferencia' && (
                <div
                  className={
                    isMinimal
                      ? 'bg-[var(--info-bg)] border border-[var(--info)] rounded-[18px] p-5 text-sm space-y-2'
                      : 'bg-[var(--info-bg)] border border-[var(--info)] rounded-xl p-4 text-sm space-y-2'
                  }
                >
                  <p className="font-semibold text-[var(--info)]">
                    Datos de ejemplo para
                    transferencia
                  </p>

                  <div className="grid grid-cols-2 gap-1 text-xs text-[#151515]">
                    <span className="text-[#667085]">
                      Banco:
                    </span>
                    <span>Banco Estado</span>

                    <span className="text-[#667085]">
                      Cuenta:
                    </span>
                    <span>012345678</span>

                    <span className="text-[#667085]">
                      RUT:
                    </span>
                    <span>
                      12.345.678-9
                    </span>

                    <span className="text-[#667085]">
                      Monto:
                    </span>
                    <span className="font-bold">
                      {formatPrice(total)}
                    </span>
                  </div>

                  <p className="text-xs text-[#667085]">
                    Demostración: no realices
                    transferencias a estos datos.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ===============================================
              CONFIRMAR
          ================================================ */}
          {step === 'confirm' && (
            <div className={panelClass}>
              <div>
                {isMinimal && (
                  <p className="text-xs text-gray-400 mb-1">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div
                  className={
                    isMinimal
                      ? 'bg-[#f7f7f5] rounded-[18px] p-4'
                      : 'bg-[var(--muted)] rounded-xl p-4'
                  }
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#667085] mb-2">
                    Contacto
                  </p>

                  <p className={isCatalog ? "font-medium text-[#151515]" : "font-medium"}>
                    {contact.name}
                  </p>

                  <p className="text-[#667085]">
                    {contact.email}
                  </p>
                </div>

                <div
                  className={
                    isMinimal
                      ? 'bg-[#f7f7f5] rounded-[18px] p-4'
                      : 'bg-[var(--muted)] rounded-xl p-4'
                  }
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#667085] mb-2">
                    Entrega
                  </p>

                  <p className={isCatalog ? "font-medium text-[#151515]" : "font-medium"}>
                    {shippingMethod}
                  </p>

                  {shippingMethod !==
                    'Retiro' && (
                    <p className="text-[#667085] text-xs mt-0.5">
                      {address.street}{' '}
                      {address.number},{' '}
                      {address.city}
                    </p>
                  )}
                </div>
              </div>

              <div
                className={
                  isMinimal
                    ? 'bg-[#f7f7f5] rounded-[18px] p-4 text-sm'
                    : 'bg-[var(--muted)] rounded-xl p-4 text-sm'
                }
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-[#667085] mb-2">
                  Pago
                </p>

                <p className={isCatalog ? "font-medium text-[#151515]" : "font-medium"}>
                  {paymentLabel}
                </p>

                {paymentDetail && (
                  <p className="text-[#667085] text-xs mt-0.5">
                    {paymentDetail}
                  </p>
                )}
              </div>

              <Alert variant="info">
                Al confirmar aceptas nuestras{' '}
                <Link
                  to={route('legal/terms')}
                  className="font-semibold underline"
                  target="_blank"
                >
                  condiciones de uso
                </Link>{' '}
                y{' '}
                <Link
                  to={route(
                    'legal/privacy',
                  )}
                  className="font-semibold underline"
                  target="_blank"
                >
                  política de privacidad
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
                <button
                  type="button"
                  onClick={prev}
                  className="h-11 px-5 rounded-[8px] border border-black bg-white text-[11px] font-semibold hover:bg-black hover:text-white transition-colors"
                >
                  ← Volver
                </button>
              ) : isMinimal ? (
                <button
                  type="button"
                  onClick={prev}
                  className="h-11 px-5 rounded-full border border-[var(--border)] bg-white text-sm font-semibold hover:bg-[var(--muted)] transition-colors"
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
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleConfirm}
                  className="min-h-12 px-6 rounded-[8px] bg-black text-white text-[12px] font-semibold hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                  {loading ? 'Procesando...' : `Confirmar y pagar ${formatPrice(total)}`}
                </button>
              ) : isMinimal ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleConfirm}
                  className="min-h-12 px-6 rounded-full bg-[#17213b] text-white text-sm font-semibold hover:bg-[#0f2a56] disabled:opacity-50 transition-colors"
                >
                  {loading
                    ? 'Procesando...'
                    : `Confirmar y pagar ${formatPrice(
                        total,
                      )}`}
                </button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  loading={loading}
                  onClick={
                    handleConfirm
                  }
                >
                  Confirmar y pagar{' '}
                  {formatPrice(total)}
                </Button>
              )
            ) : isVisual ? (
              <button
                type="button"
                onClick={next}
                className="h-11 px-6 rounded-[8px] bg-black text-white text-[12px] font-semibold hover:opacity-80 transition-opacity"
              >
                Continuar →
              </button>
            ) : isMinimal ? (
              <button
                type="button"
                onClick={next}
                className="h-11 px-6 rounded-full bg-[#17213b] text-white text-sm font-semibold hover:bg-[#0f2a56] transition-colors"
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
        <aside className="lg:col-span-2">
          <div
            className={
              isVisual
                ? 'bg-[#f1f1f0] rounded-[10px] p-5 md:p-6 sticky top-24'
                : isMinimal
                  ? 'bg-white border border-black/5 rounded-[24px] p-5 sticky top-24'
                  : 'bg-white border border-[var(--border)] rounded-2xl p-5 sticky top-24'
            }
          >
            <h3
              className={
                isMinimal
                  ? 'font-semibold text-lg tracking-tight mb-5'
                  : 'font-semibold mb-4 text-sm uppercase tracking-wider text-[#667085]'
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

                    <span className={`absolute -top-1.5 -right-1.5 w-5 h-5 text-white text-[10px] rounded-full flex items-center justify-center font-bold ${
                        isVisual ? 'bg-black' : 'bg-[#17213b]'
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

                    <p className="text-xs text-[#667085] mt-0.5">
                      {Object.values(
                        item.attributes,
                      ).join(' / ')}
                    </p>
                  </div>

                  <p className="text-xs font-semibold">
                    {formatPrice(
                      item.price *
                        item.quantity,
                    )}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] pt-4 flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#667085]">
                  Subtotal
                </span>

                <span>
                  {formatPrice(subtotal)}
                </span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between text-[var(--success)]">
                  <span>Descuento</span>

                  <span>
                    −{formatPrice(
                      discount,
                    )}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-[#667085]">
                  Envío
                </span>

                <span>
                  {shipping === 0 ? (
                    <span className="text-[var(--success)]">
                      Gratis
                    </span>
                  ) : (
                    formatPrice(shipping)
                  )}
                </span>
              </div>

              <div
                className={
                  isVisual
                    ? 'flex justify-between font-serif text-[22px] border-t border-black/10 pt-4 mt-1'
                    : isMinimal
                      ? 'flex justify-between font-semibold text-lg border-t border-[var(--border)] pt-4 mt-1'
                      : 'flex justify-between font-bold text-base border-t border-[var(--border)] pt-2 mt-1'
                }
              >
                <span>Total</span>

                <span>
                  {formatPrice(total)}
                </span>
              </div>
            </div>

            {(isMinimal || isVisual) && (
              <Link
                to={route('carrito')}
                className={
                  isVisual
                    ? 'block text-center text-[10px] uppercase tracking-[0.12em] text-[#77716e] hover:text-black mt-5 transition-colors'
                    : 'block text-center text-xs text-gray-400 hover:text-[#17213b] mt-5 transition-colors'
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