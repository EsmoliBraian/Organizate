# Organizate

Calendario estilo almanaque de pared para tareas y notas. Funciona en compu y celular.

- Vistas **Mes / Semana / Día**, mini calendario y agenda del día.
- **Tareas** (se tildan: pasan a verde) y **Notas** (tipo post-it), con 6 colores.
- Las tareas vencidas sin hacer se marcan en rojo.
- **Arrastrar y soltar** para cambiar de día (en el celu: mantener apretado y arrastrar).
- Búsqueda, exportar/importar respaldo en JSON.
- Se puede instalar en el celu: "Agregar a pantalla de inicio".

Es HTML + CSS + JS sin compilar: se publica tal cual en GitHub Pages.

## Dónde se guardan los datos

GitHub Pages solo sirve archivos: **no tiene base de datos**. Por eso hay dos modos:

| Modo | Cómo | Sirve para |
|---|---|---|
| Local (por defecto) | `localStorage` del navegador | Usarlo en un solo dispositivo. Si borrás los datos del navegador, se pierde (usá Exportar). |
| Nube (Supabase, gratis) | completar `js/config.js` | Ver lo mismo en celu y compu, con login por mail. |

Aunque esté conectado a la nube, sigue guardando una copia local: anda sin internet y sube los cambios cuando vuelve la conexión.

## Conectar Supabase (10 minutos)

1. Crear cuenta y proyecto en <https://supabase.com> (plan Free).
2. **SQL Editor** → pegar el contenido de [`supabase.sql`](supabase.sql) → **Run**.
3. **Authentication → URL Configuration**:
   - *Site URL*: `https://esmolibraian.github.io/Organizate/`
   - *Redirect URLs*: agregar la misma URL (y `http://localhost:5500/` si lo probás local).
4. **Project Settings → API**: copiar *Project URL* y la *anon public key* en [`js/config.js`](js/config.js).
5. Subir el cambio. En la app: **Ajustes → Sincronizar** → poner tu mail → abrir el link que llega.

La *anon key* puede estar en el repo público: las reglas de `supabase.sql` hacen que cada usuario solo pueda leer y escribir sus propios datos.

## Probar en local

```bash
npx serve -l 5500 .
```

y abrir <http://localhost:5500>.
