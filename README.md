<div align="center">

# Hermes ⚡

**Espacio de trabajo local-first e inteligente para notas, audio e ideas estructuradas.**

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-blue?style=flat-square&logo=tauri)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-green.svg?style=flat-square)](LICENSE)

</div>

---

## 📌 Sobre el Proyecto

**Hermes** es una aplicación de escritorio nativa y multiplataforma diseñada para la toma de notas de alto rendimiento, la captura de ideas por voz y la organización de flujos de trabajo asistidos por IA.

Desarrollada bajo un enfoque **local-first**, la app combina un editor por bloques con la velocidad, seguridad y ligereza de un ejecutable nativo construido en Rust mediante **Tauri v2**.

---

## 🛠️ Tecnologías Utilizadas

* **Frontend Framework:** Next.js 14 (App Router) & React 18
* **Estilos & UI:** Tailwind CSS
* **Motor del Editor:** Tiptap / ProseMirror
* **Runtime de Escritorio:** Tauri v2 (Rust)
* **Lenguajes:** TypeScript, Rust, Node.js

---

## 🏗️ Arquitectura y Funcionamiento Interno

El proyecto utiliza una arquitectura híbrida optimizada para rendimiento en producción y agilidad en desarrollo:

### 1. Núcleo del Frontend (Next.js & Tiptap)
* **Editor WYSIWYG por bloques:** Basado en Tiptap/ProseMirror, permite formatear texto enriquecido, listas, bloques de código e integración de componentes dinámicos.
* **Modo Standalone:** Configurado mediante `NEXT_OUTPUT=standalone` en Next.js. Esto compila el servidor de Node.js y las páginas en una estructura ligera dentro de `.next/standalone`, eliminando la necesidad de empaquetar la carpeta `node_modules` completa.

### 2. Capa Nativa y Pipeline de Build (Tauri v2 & Rust)
* **Integración del Servidor:** En producción, el proceso en Rust (`src-tauri/src/main.rs`) inicia el servidor embebido de Next.js (`server.js`) y renderiza la interfaz mediante el motor WebView nativo del sistema operativo.
* **Automatización de Assets:** El script `scripts/copy-standalone-to-tauri.mjs` copia el servidor compilado, los assets estáticos (`.next/static`) y los recursos públicos hacia `src-tauri/resources/standalone/` antes de empaquetar el ejecutable final (`.exe` / `.msi`).
* **Hot-Reloading en Desarrollo:** Durante `npm run tauri:dev`, Tauri se conecta directamente al servidor de desarrollo de Next.js (`http://localhost:3000`) sin necesidad de recompilar los recursos nativos en cada cambio de interfaz.

---

## ⚙️ Guía de Instalación y Configuración (Setup Paso a Paso)

Sigue estos pasos en orden para configurar las dependencias del sistema, clonar el repositorio, agregar las claves de API y poner en marcha la aplicación.

### Paso 1: Instalación de Requisitos Previos y Herramientas del Sistema

Asegúrate de contar con el entorno de ejecución básico y los compiladores requeridos por Rust/Tauri según tu sistema operativo:

1. **Instalar Node.js:**
   * Descarga e instala **Node.js (v18.x o superior)** desde [nodejs.org](https://nodejs.org/).
2. **Instalar Rust:**
   * Descarga e instala **Rust Toolchain** ejecutando el instalador interactivo de [rustup.rs](https://rustup.rs/).
3. **Compiladores del sistema según el Sistema Operativo:**
   * **Windows:** Descarga e instala [Visual Studio Community](https://visualstudio.microsoft.com/). Durante la instalación, marca la casilla **"Desarrollo para el escritorio con C++"**.
   * **macOS:** Abre la terminal y ejecuta `xcode-select --install`.
   * **Linux (Ubuntu/Debian):** Abre la terminal e instala las librerías nativas con el siguiente comando:
     ```bash
     sudo apt update
     sudo apt install build-essential curl wget libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev
     ```

---

### Paso 2: Clonar el Repositorio

Abre tu terminal o consola de comandos y descarga el código fuente del proyecto:

```bash
git clone [https://github.com/Pasetti23/Hermes.git](https://github.com/Pasetti23/Hermes.git)
cd Hermes
```

### Paso 3: Configuración de Variables de Entorno y API Keys
La aplicación utiliza la API de Google Gemini o Openai para alimentar sus funciones de inteligencia artificial y procesamiento de notas.

En la raíz de la carpeta del proyecto, crea un archivo llamado `.env`:

```bash
cp .env.example .env
```

*(Si no existe `.env.example`, puedes crear directamente un archivo con el nombre `.env` en la raíz del proyecto).*

Abre el archivo `.env` en tu editor de código y agrega la variable con tu clave de API:

```env
# API Key para las funciones de Inteligencia Artificial (Google Gemini)
NEXT_PUBLIC_GEMINI_API_KEY=tu_api_key_aqui
```

💡 **¿Dónde obtener la API Key?:** Puedes generar una clave gratuita en [Google AI Studio](https://aistudio.google.com/).

---

### Paso 4: Instalación de Dependencias de Node.js
Con la terminal ubicada en la carpeta raíz del proyecto, ejecuta:

```bash
npm install
```

---

### Paso 5: Iniciar la Aplicación en Modo Desarrollo
Para ejecutar Hermes localmente con soporte de recarga en vivo (*Hot-Reloading*):

```bash
npm run tauri:dev
```

Este comando iniciará el servidor web interno de Next.js en `http://localhost:3000` y desplegará automáticamente la ventana de la aplicación nativa de Hermes.

---

### 📦 Compilación y Generación del Ejecutable (.EXE)
Si deseas empaquetar la aplicación y generar el instalador final optimizado para producción:

```bash
npm run tauri:build
```

Una vez finalizado el proceso de compilación, los archivos del instalador (`.msi` / `.exe` o binario ejecutable) se guardarán en la siguiente ruta:
```text
src-tauri/target/release/bundle/
```











