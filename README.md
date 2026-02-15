# Polymarket Copy Trading Bot 🚀

Este bot copia automáticamente las operaciones de usuarios específicos en Polymarket.

## Requisitos Previos

1. **Node.js v18+**: Descárgalo en [nodejs.org](https://nodejs.org/).
2. **Git**: Para clonar el repositorio.

## Instalación en una Nueva PC

Sigue estos pasos para configurar el bot desde cero:

1. **Clonar el Repositorio**
   ```bash
   git clone https://github.com/lucastenaglia/polymkt
   cd polymkt
   ```

2. **Instalar Dependencias**
   Este comando instalará todas las librerías necesarias (el equivalente al archivo "requirements"):
   ```bash
   npm install
   ```

3. **Configurar el Entorno**
   - Copia el archivo de ejemplo: `cp .env.example .env` (o cámbiale el nombre manualmente).
   - Abre el archivo `.env` y rellena tus datos:
     - `PRIVATE_KEY`: Tu clave privada de Polygon/Phantom.
     - `TELEGRAM_BOT_TOKEN`: El token de tu bot de @BotFather.
     - `PROXY_ADDRESS`: Tu dirección de Gnosis Safe (si usas modo Proxy).
     - `TARGET_USERS`: Direcciones de los usuarios a copiar (separadas por coma).

4. **Iniciar el Bot**
   ```bash
   npm run dev
   ```

## Comandos Disponibles

- `npm run dev`: Inicia el bot en modo desarrollo.
- `npm run build`: Compila el código a JavaScript.
- `npm run exe`: Genera un archivo `.exe` para Windows independendiente.

---
**Nota**: Nunca compartas tu archivo `.env` ni tu `PRIVATE_KEY`. El archivo `bot.db` contiene tu historial local de operaciones.
