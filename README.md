<div align="center">

# Hermes ⚡

**Espacio de trabajo local-first e inteligente para notas, audio e ideas estructuradas.**

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-blue?style=flat-square&logo=tauri)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-green.svg?style=flat-square)](LICENSE)

</div>

---

## 📌 Sobre el Proyecto

**Hermes** es una aplicación de escritorio nativa y multiplataforma diseñada para la toma de notas de alto rendimiento, la captura de ideas por voz y la organización de flujos de trabajo asistidos por IA. 

Desarrollada bajo un enfoque **local-first**, la app combina un editor por bloques tipo Notion con la velocidad y ligereza de un ejecutable nativo construido en Rust mediante **Tauri v2**.

---

## 🏗️ Arquitectura y Funcionamiento Interno

El proyecto utiliza una arquitectura híbrida optimizada para producción y desarrollo:

### 1. Núcleo del Frontend (Next.js & Tiptap)
* **Editor WYSIWYG por bloques:** Basado en Tiptap/ProseMirror, permite formatear texto enriquecido, listas, bloques de código e integración de componentes interactivos.
* **Modo Standalone:** Configurado mediante `NEXT_OUTPUT=standalone` en Next.js. Esto compila el servidor de Node.js y las páginas en una estructura ligera dentro de `.next/standalone`, eliminando la necesidad de empaquetar la carpeta `node_modules` completa.

### 2. Capa Nativa y Pipeline de Build (Tauri v2 & Rust)
* **Integración del Servidor:** En entornos de producción, el proceso en Rust (`src-tauri/src/main.rs`) inicia el servidor embebido de Next.js (`server.js`) y renderiza la interfaz mediante el motor WebView del sistema operativo.
* **Automatización de Assets:** El script `scripts/copy-standalone-to-tauri.mjs` se encarga de mover el código del servidor compilado, los assets estáticos (`.next/static`) y los recursos públicos hacia `src-tauri/resources/standalone/` antes de empaquetar el binario ejecutable (`.exe`).
* **Hot-Reloading en Desarrollo:** Durante `npm run tauri:dev`, Tauri se enlaza directamente al servidor de desarrollo de Next.js (`http://localhost:3000`) sin necesidad de recompilar los recursos nativos en cada cambio de interfaz.

---

## 🛠️ Tecnologías Utilizadas

* **Frontend:** Next.js 14 (App Router), React, Tailwind CSS
* **Motor del Editor:** Tiptap / ProseMirror
* **Runtime de Escritorio:** Tauri v2 (Rust)
* **Lenguajes:** TypeScript, Rust, JavaScript (Node.js)

---

## 🚀 Instalación y Configuración Local

### Requisitos Previos

* **Node.js:** v18.x o superior.
* **Rust Toolchain:** Instalado mediante `rustup`.
* **C++ Build Tools:** Visual Studio Community (con la carga de trabajo *Desarrollo para el escritorio con C++* en Windows).

### Pasos de Instalación

1. **Clonar el repositorio:**
   ```bash
   git clone [https://github.com/Pasetti23/Hermes.git](https://github.com/Pasetti23/Hermes.git)
   cd Hermes
