#!/usr/bin/env python3
"""
AI PR Quality Gate & Automatic Conflict Resolver
OpenMind - Proyecto Fundación Gestionar

Este script actúa como el revisor automatizado de calidad y conflictos para Pull Requests
que tienen como destino la rama 'develop'.

Funcionalidades:
1. Detección y auto-resolución de conflictos Git usando Google Gemini AI.
2. Validación de estado de pruebas backend (Django) y frontend (React/TypeScript).
3. Auditoría de código del diff del PR con recomendaciones arquitecturales.
4. Publicación/actualización de comentarios detallados en el Pull Request.
5. Bloqueo automático (Exit code 1) si el PR rompe el flujo o tiene conflictos irresolubles.
"""

import os
import sys
import re
import json
import argparse
import subprocess
from typing import Optional, Tuple, List, Dict
import requests

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

COMMENT_MARKER = "<!-- AI_PR_QUALITY_GATE -->"

def ejecutar_comando(comando: list, cwd: Optional[str] = None) -> Tuple[int, str]:
    """Ejecuta un comando en consola y retorna (código de salida, salida combinada)."""
    try:
        resultado = subprocess.run(
            comando,
            cwd=cwd,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=False
        )
        salida = f"{resultado.stdout}\n{resultado.stderr}".strip()
        return resultado.returncode, salida
    except Exception as e:
        return 1, f"Error ejecutando {' '.join(comando)}: {str(e)}"

def obtener_git_diff(target_branch: str) -> str:
    """Extrae el diff comparativo contra la rama destino develop."""
    code, diff = ejecutar_comando(["git", "diff", f"origin/{target_branch}...HEAD"])
    if code != 0 or not diff:
        code, diff = ejecutar_comando(["git", "diff", "HEAD~1..HEAD"])
    return diff[:12000] if diff else "No hay cambios registrados en el diff."

def leer_archivo_log(ruta: Optional[str], limite_caracteres: int = 4000) -> str:
    """Lee y trunca un log si excede el tamaño máximo."""
    if not ruta or not os.path.exists(ruta):
        return "Log no disponible o archivo ausente."
    try:
        with open(ruta, "r", encoding="utf-8", errors="ignore") as f:
            contenido = f.read().strip()
            return contenido[:limite_caracteres] if contenido else "Sin registros de salida."
    except Exception as e:
        return f"No se pudo leer el archivo {ruta}: {str(e)}"

def llamar_gemini(prompt: str, api_key: str, model: str = "gemini-2.5-flash") -> Optional[str]:
    """Llama a la API de Google Gemini REST con reintento en modelos alternativos."""
    modelos_candidatos = [model, "gemini-1.5-flash", "gemini-2.0-flash"]
    vistos = set()

    for m in modelos_candidatos:
        if m in vistos:
            continue
        vistos.add(m)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 4096
            }
        }
        try:
            resp = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=45)
            if resp.status_code == 200:
                data = resp.json()
                candidatos = data.get("candidates", [])
                if candidatos and "content" in candidatos[0]:
                    partes = candidatos[0]["content"].get("parts", [])
                    if partes and "text" in partes[0]:
                        return partes[0]["text"]
            else:
                print(f"[Gemini API Warning] Modelo {m} respondió {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"[Gemini API Error] Fallo al consultar {m}: {str(e)}")

    return None

def resolver_archivo_conflicto(ruta_archivo: str, api_key: str, target_branch: str) -> bool:
    """Usa IA para resolver los marcadores de conflicto de un archivo específico."""
    if not os.path.exists(ruta_archivo):
        return False

    try:
        with open(ruta_archivo, "r", encoding="utf-8", errors="ignore") as f:
            contenido = f.read()
    except Exception as e:
        print(f"Error leyendo {ruta_archivo}: {e}")
        return False

    if "<<<<<<<" not in contenido or ">>>>>>>" not in contenido:
        return True  # Ya no tiene marcadores

    prompt = f"""Eres un ingeniero senior de software encargado de resolver conflictos de fusión (merge conflicts) en Git.
Archivo en conflicto: {ruta_archivo}
Rama destino: {target_branch}
Rama actual: HEAD (rama del Pull Request)

A continuación está el contenido del archivo con marcas de conflicto ('<<<<<<< HEAD', '=======', '>>>>>>> origin/{target_branch}').
Instrucciones estrictas:
1. Reconcilia los cambios conservando las mejoras y funcionalidades de AMBOS lados sin eliminar código necesario.
2. Mantén todas las importaciones, rutas, modelos, funciones, componentes y pruebas necesarias.
3. ELIMINA COMPLETAMENTE todas las marcas de conflicto (<<<<<<<, =======, >>>>>>>).
4. No rompas la sintaxis del lenguaje.
5. Devuelve ÚNICAMENTE el código fuente resuelto. NO incluyas explicaciones, ni bloques markdown como ```typescript o ```python, solo el texto plano final del archivo.

Contenido del archivo:
{contenido}
"""

    texto_resuelto = llamar_gemini(prompt, api_key)
    if not texto_resuelto:
        return False

    # Limpiar posibles bloques markdown si el modelo los incluyó
    texto_limpio = texto_resuelto.strip()
    if texto_limpio.startswith("```"):
        lineas = texto_limpio.splitlines()
        if len(lineas) >= 2 and lineas[0].startswith("```") and lineas[-1].startswith("```"):
            texto_limpio = "\n".join(lineas[1:-1])

    # Verificar que no quedaron marcadores
    if "<<<<<<<" in texto_limpio or ">>>>>>>" in texto_limpio or "=======" in texto_limpio:
        print(f"[Conflicto] El modelo dejó marcadores de conflicto en {ruta_archivo}.")
        return False

    try:
        with open(ruta_archivo, "w", encoding="utf-8") as f:
            f.write(texto_limpio)
        ejecutar_comando(["git", "add", ruta_archivo])
        print(f"[Conflicto Resuelto] {ruta_archivo} procesado y añadido a git stage.")
        return True
    except Exception as e:
        print(f"Error guardando {ruta_archivo}: {e}")
        return False

def resolver_conflictos_automaticamente(target_branch: str, api_key: Optional[str]) -> Tuple[bool, List[str], str]:
    """
    Intenta fusionar origin/{target_branch} en la rama actual. Si hay conflictos,
    intenta resolverlos con el Agente IA y hacer commit/push.
    """
    if not api_key:
        return False, [], "No se proporcionó GEMINI_API_KEY para auto-resolver conflictos."

    # Obtener archivos en conflicto
    code, out = ejecutar_comando(["git", "diff", "--name-only", "--diff-filter=U"])
    archivos_conflicto = [line.strip() for line in out.splitlines() if line.strip()]

    if not archivos_conflicto:
        return True, [], "No hay archivos en conflicto no fusionados."

    print(f"[Conflictos Detectados] Archivos con colisión: {archivos_conflicto}")
    archivos_resueltos = []

    for archivo in archivos_conflicto:
        if resolver_archivo_conflicto(archivo, api_key, target_branch):
            archivos_resueltos.append(archivo)
        else:
            print(f"[Fallo de Resolución] No se pudo resolver automáticamente {archivo}")
            return False, archivos_resueltos, f"No se pudo resolver el archivo {archivo}"

    # Verificar si quedan conflictos pendientes en git
    code, out = ejecutar_comando(["git", "diff", "--name-only", "--diff-filter=U"])
    restantes = [l.strip() for l in out.splitlines() if l.strip()]
    if restantes:
        return False, archivos_resueltos, f"Aún quedan conflictos pendientes: {restantes}"

    # Commit del merge resuelto
    mensaje_commit = f"chore(ai): auto-resolve merge conflicts with origin/{target_branch}"
    c_code, c_out = ejecutar_comando(["git", "commit", "-m", mensaje_commit])
    if c_code != 0:
        return False, archivos_resueltos, f"Error al commitear resolución: {c_out}"

    # Intentar push a la rama del PR
    p_code, p_out = ejecutar_comando(["git", "push", "origin", "HEAD"])
    if p_code != 0:
        print(f"[Git Push Warning] No se pudo hacer push directo (quizás permisos o ref): {p_out}")

    return True, archivos_resueltos, "Conflictos resueltos y guardados con éxito."

def generar_analisis_ia(
    api_key: Optional[str],
    target_branch: str,
    has_conflicts: bool,
    conflicts_log: str,
    backend_success: bool,
    backend_log: str,
    frontend_success: bool,
    frontend_log: str,
    diff_text: str
) -> str:
    """Genera la auditoría del PR utilizando Gemini o fallback determinista."""
    if not api_key:
        return """### 🤖 Análisis del Agente IA (Modo Sin API Key)
*La clave `GEMINI_API_KEY` no se encuentra configurada en los Secretos del repositorio.*
Se aplicó la validación determinista basada en pruebas y compilación. Para activar sugerencias de arquitectura, explicaciones de código y resolución guiada de conflictos con Gemini, configure el secreto `GEMINI_API_KEY`."""

    prompt = f"""Actúas como el Agente Senior de Calidad y Arquitectura de Software del equipo OpenMind para el proyecto 'Fundación Gestionar'.
Tu labor es auditar un Pull Request que solicita fusionarse contra la rama '{target_branch}'.

RESULTADOS DEL CONTROL DE CALIDAD (CI):
1. Conflictos con {target_branch}: {'SÍ HAY CONFLICTOS' if has_conflicts else 'Sin conflictos directos'}
Log de conflictos:
{conflicts_log[:1500]}

2. Backend (Django / PostgreSQL / MongoDB): {'EXITOSO' if backend_success else 'FALLIDO / CON ERRORES'}
Log Backend:
{backend_log[:2000]}

3. Frontend (React / Vite / TypeScript): {'EXITOSO' if frontend_success else 'FALLIDO / CON ERRORES'}
Log Frontend:
{frontend_log[:2000]}

4. Git Diff de los cambios propuestos:
```diff
{diff_text[:6000]}
```

Genera un reporte técnico claro, estructurado y profesional en formato Markdown con las siguientes secciones:
1. 📋 **Resumen del Análisis**: Breve explicación de qué aporta este PR y su impacto arquitectural.
2. ⚠️ **Diagnóstico de Fallos y Conflictos**: Si hay errores o conflictos, explica con precisión por qué ocurrieron y cuál es la solución exacta paso a paso. Si todo pasó, confirma que el flujo está intacto.
3. 🔒 **Calidad, Seguridad y Rendimiento**: Evalúa buenas prácticas (manejo de excepciones, transacciones, tipado estricto, variables de entorno).
4. 👨‍💻 **Veredicto para el Encargado de Git**: Instrucción clara indicando si el PR está listo para ser aceptado ("Merge Aprobado") o si debe solicitar cambios ("Cambios Requeridos").
"""

    respuesta = llamar_gemini(prompt, api_key)
    if respuesta:
        return respuesta.strip()

    return """### 🤖 Análisis del Agente IA
No se pudo obtener respuesta del servicio de IA en este momento. El veredicto técnico se basa en las compuertas de pruebas automáticas."""

def publicar_comentario_github(
    repo: str,
    pr_number: int,
    github_token: str,
    cuerpo_comentario: str
) -> bool:
    """Publica o actualiza el comentario de estado en el Pull Request."""
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    url_base = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"

    try:
        # Buscar comentarios previos del bot para evitar spam
        r_get = requests.get(url_base, headers=headers, timeout=20)
        comentario_existente_id = None
        if r_get.status_code == 200:
            for c in r_get.json():
                if COMMENT_MARKER in c.get("body", ""):
                    comentario_existente_id = c.get("id")
                    break

        contenido_final = f"{COMMENT_MARKER}\n{cuerpo_comentario}"

        if comentario_existente_id:
            url_update = f"https://api.github.com/repos/{repo}/issues/comments/{comentario_existente_id}"
            r_patch = requests.patch(url_update, headers=headers, json={"body": contenido_final}, timeout=20)
            if r_patch.status_code in (200, 201):
                print(f"[GitHub PR] Comentario #{comentario_existente_id} actualizado exitosamente.")
                return True
        else:
            r_post = requests.post(url_base, headers=headers, json={"body": contenido_final}, timeout=20)
            if r_post.status_code in (200, 201):
                print(f"[GitHub PR] Nuevo comentario publicado exitosamente en PR #{pr_number}.")
                return True

        print(f"[GitHub PR Warning] Código de respuesta: {r_get.status_code}")
    except Exception as e:
        print(f"[GitHub PR Error] No se pudo publicar comentario: {e}")

    return False

def main():
    parser = argparse.ArgumentParser(description="AI PR Quality Gate & Conflict Resolver")
    parser.add_argument("--mode", choices=["resolve", "review", "full"], default="full", help="Modo de ejecución")
    parser.add_argument("--pr-number", type=int, default=os.getenv("PR_NUMBER") or os.getenv("GITHUB_PR_NUMBER"), help="Número de Pull Request")
    parser.add_argument("--repo", default=os.getenv("GITHUB_REPOSITORY"), help="Repositorio (owner/repo)")
    parser.add_argument("--target-branch", default="develop", help="Rama objetivo (default: develop)")
    parser.add_argument("--has-conflicts", default="false", help="'true' si se detectaron conflictos")
    parser.add_argument("--conflicts-log", default="ci_logs/conflicts.log", help="Ruta al log de conflictos")
    parser.add_argument("--backend-log", default="ci_logs/backend.log", help="Ruta al log de backend")
    parser.add_argument("--frontend-log", default="ci_logs/frontend.log", help="Ruta al log de frontend")
    parser.add_argument("--summary-output", default="ci_logs/summary.md", help="Ruta donde guardar el resumen generado")
    parser.add_argument("--dry-run", action="store_true", help="No realizar llamadas a GitHub API")

    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY")
    github_token = os.getenv("GITHUB_TOKEN")

    hay_conflictos_inicial = str(args.has_conflicts).lower() == "true"
    archivos_resueltos = []
    conflictos_resueltos_ok = False

    # 1. AUTO-RESOLUCIÓN DE CONFLICTOS SI APLICA
    if args.mode in ("resolve", "full") and hay_conflictos_inicial:
        print("[Auto-Resolver] Detectados conflictos de fusión contra develop. Iniciando Agente IA...")
        resuelto, archivos_resueltos, detalle = resolver_conflictos_automaticamente(args.target_branch, api_key)
        conflictos_resueltos_ok = resuelto
        if resuelto:
            print(f"[Auto-Resolver] ✅ Éxito resolviendo {len(archivos_resueltos)} archivo(s): {archivos_resueltos}")
            with open(args.conflicts_log, "a", encoding="utf-8") as f:
                f.write(f"\n[AI RESOLVER] Conflictos auto-resueltos en: {', '.join(archivos_resueltos)}\n")
        else:
            print(f"[Auto-Resolver] ❌ No se pudieron auto-resolver los conflictos: {detalle}")
            with open(args.conflicts_log, "a", encoding="utf-8") as f:
                f.write(f"\n[AI RESOLVER ERROR] {detalle}\n")

    # Leer los logs de ejecución
    log_conflictos = leer_archivo_log(args.conflicts_log)
    log_backend = leer_archivo_log(args.backend_log)
    log_frontend = leer_archivo_log(args.frontend_log)
    diff_text = obtener_git_diff(args.target_branch)

    # Determinar estado de backend y frontend
    # Evaluamos si hay indicios de error en los logs capturados
    backend_ok = True
    if "FAILED (failures=" in log_backend or "FAILED (errors=" in log_backend or "Traceback (most recent call last)" in log_backend:
        backend_ok = False
    if "SystemCheckError" in log_backend or "ModuleNotFoundError" in log_backend:
        backend_ok = False

    frontend_ok = True
    if "error TS" in log_frontend or "ERR!" in log_frontend or "fail " in log_frontend or "failed" in log_frontend.lower():
        frontend_ok = False
    if "Failed to compile" in log_frontend or "Build failed" in log_frontend:
        frontend_ok = False

    # Estado de conflictos
    if hay_conflictos_inicial and not conflictos_resueltos_ok:
        conflicto_estado_final = "🔴 Conflictos irresolubles detectados"
        tiene_conflicto_activo = True
    elif hay_conflictos_inicial and conflictos_resueltos_ok:
        conflicto_estado_final = "🟢 Conflictos resueltos automáticamente por IA"
        tiene_conflicto_activo = False
    else:
        conflicto_estado_final = "🟢 Sin conflictos de fusión contra develop"
        tiene_conflicto_activo = False

    # Veredicto Global del Quality Gate
    calidad_aprobada = (not tiene_conflicto_activo) and backend_ok and frontend_ok

    badge_veredicto = "🟢 **APROBADO PARA MERGE**" if calidad_aprobada else "🔴 **BLOQUEADO - ACCIÓN REQUERIDA**"
    icono_bk = "✅ Exitoso" if backend_ok else "❌ Fallido"
    icono_fr = "✅ Exitoso" if frontend_ok else "❌ Fallido"

    # Generar análisis de IA
    analisis_ia = generar_analisis_ia(
        api_key=api_key,
        target_branch=args.target_branch,
        has_conflicts=tiene_conflicto_activo,
        conflicts_log=log_conflictos,
        backend_success=backend_ok,
        backend_log=log_backend,
        frontend_success=frontend_ok,
        frontend_log=log_frontend,
        diff_text=diff_text
    )

    # Construir reporte en Markdown
    reporte = f"""# 🛡️ OpenMind Quality Gate & AI Audit

**Veredicto General:** {badge_veredicto}
**Rama Objetivo:** `{args.target_branch}`

### 📊 Estado de Compuertas de Integración

| Componente | Estado | Detalle |
| :--- | :---: | :--- |
| **Conflictos con `{args.target_branch}`** | {'✅' if not tiene_conflicto_activo else '❌'} | {conflicto_estado_final} |
| **Backend (Django / BD)** | {'✅' if backend_ok else '❌'} | {icono_bk} (Check del sistema y pruebas unitarias) |
| **Frontend (React / TS / Vite)** | {'✅' if frontend_ok else '❌'} | {icono_fr} (Tipado, build de producción y pruebas) |

---

{analisis_ia}

---
*Reporte generado automáticamente por OpenMind AI PR Quality Gate.*
"""

    # Guardar reporte localmente
    os.makedirs(os.path.dirname(args.summary_output) or ".", exist_ok=True)
    with open(args.summary_output, "w", encoding="utf-8") as f:
        f.write(reporte)

    # También escribir al GITHUB_STEP_SUMMARY si existe
    step_summary = os.getenv("GITHUB_STEP_SUMMARY")
    if step_summary:
        try:
            with open(step_summary, "a", encoding="utf-8") as f:
                f.write(reporte + "\n")
        except Exception:
            pass

    print("\n=================== REPORTE GENERADO ===================")
    print(reporte)
    print("========================================================\n")

    # Publicar en GitHub si contamos con token y PR
    if not args.dry_run and github_token and args.repo and args.pr_number:
        publicar_comentario_github(args.repo, args.pr_number, github_token, reporte)
    else:
        print("[Info] Publicación en GitHub omitida (dry-run o faltan variables GITHUB_TOKEN / PR_NUMBER / GITHUB_REPOSITORY).")

    # Si la calidad no fue aprobada, salir con código 1 para que el workflow falle y bloquee el merge
    if not calidad_aprobada:
        print("\n[QUALITY GATE BLOQUEADO] Se detectaron errores o conflictos que rompen el flujo. El PR no puede fusionarse.")
        sys.exit(1)
    else:
        print("\n[QUALITY GATE APROBADO] Todas las compuertas pasaron correctamente. El PR es seguro para el encargado de Git.")
        sys.exit(0)

if __name__ == "__main__":
    main()