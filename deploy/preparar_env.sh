#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"

DOMINIO="${1:-}"
GOOGLE="${2:-}"
if [ -z "$DOMINIO" ]; then
  echo "Falta la dirección de la tienda."
  echo "Uso: bash deploy/preparar_env.sh tutienda.cl     (o 'localhost' para probar en tu computador)"
  exit 1
fi
if [ -f .env ]; then
  echo "Ya existe deploy/.env, no lo voy a sobrescribir. Si quieres uno nuevo, bórralo primero."
  exit 1
fi

texto() { head -c 120 /dev/urandom | base64 | tr -d '/+=\n' | cut -c1-"$1"; }
clave_fernet() { head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '\n'; }

cp produccion.env.example .env
sed -i "s|^DOMAIN=.*|DOMAIN=$DOMINIO|" .env
sed -i "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$(texto 64)|" .env
sed -i "s|^PAYMENT_CREDENTIALS_KEY=.*|PAYMENT_CREDENTIALS_KEY=$(clave_fernet)|" .env
sed -i "s|^GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY=.*|GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY=$(clave_fernet)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(texto 32)|" .env
sed -i "s|^MONGO_PASSWORD=.*|MONGO_PASSWORD=$(texto 32)|" .env
sed -i "s|^DEFAULT_FROM_EMAIL=.*|DEFAULT_FROM_EMAIL=Mi Tienda <contacto@$DOMINIO>|" .env
[ -z "$GOOGLE" ] || sed -i "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=$GOOGLE|" .env
chmod 600 .env

echo "Listo: se creó deploy/.env para $DOMINIO con claves nuevas."
echo "Guarda una copia de ese archivo en un lugar seguro: sin él no se pueden descifrar las credenciales de pago."
if [ -z "$GOOGLE" ]; then
  echo "OBLIGATORIO: completa GOOGLE_CLIENT_ID en deploy/.env (sin él la página de ingreso no abre)."
fi
echo "Falta completar a mano: EMAIL_HOST_USER y EMAIL_HOST_PASSWORD (correo de la tienda)."
