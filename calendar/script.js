const contenedor = document.getElementById("dark-calendario");

let fecha = new Date();
let festivosCache = {};

// =====================================================
// FESTIVOS GRANADA 2026 - COMPLETO Y OFICIAL
// Fuente: BOE + Decreto 101/2025 Junta de Andalucía
//         + Ayuntamiento de Granada
// =====================================================
// Nacionales (8): 01/01, 06/01, 03/04, 01/05, 15/08,
//                 12/10, 08/12, 25/12
// Autonómicos Andalucía (4): 06/01*, 02/04, 28/02**,
//                 02/11(traslado), 07/12(traslado)
// Locales Granada (2): 02/01, 04/06
//
// ** 28/02 cae sábado en 2026, no computa como laborable
// =====================================================

const FESTIVOS_GRANADA = {
  "2026": {
    "2026-01-01": "Año Nuevo",
    "2026-01-02": "Toma de Granada (local)",
    "2026-01-06": "Epifanía del Señor (Reyes)",
    "2026-02-28": "Día de Andalucía",
    "2026-04-02": "Jueves Santo",
    "2026-04-03": "Viernes Santo",
    "2026-05-01": "Día del Trabajo",
    "2026-06-04": "Corpus Christi (local)",
    "2026-08-15": "Asunción de la Virgen",
    "2026-10-12": "Fiesta Nacional de España",
    "2026-11-02": "Todos los Santos (traslado)",
    "2026-12-07": "Día de la Constitución (traslado)",
    "2026-12-08": "Inmaculada Concepción",
    "2026-12-25": "Navidad",
  }
};

// ---- OBTENER FESTIVOS ----
// Para 2026 usa los datos hardcodeados (100% fiables).
// Para otros años intenta la API nacional como fallback.
async function obtenerFestivos(anio) {
  if (festivosCache[anio]) return festivosCache[anio];

  const anioStr = String(anio);

  if (FESTIVOS_GRANADA[anioStr]) {
    festivosCache[anio] = FESTIVOS_GRANADA[anioStr];
    return festivosCache[anio];
  }

  // Fallback: API festivos nacionales para otros años
  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${anio}/ES`);
    const holidays = await response.json();
    const mapa = {};
    holidays.forEach(h => { mapa[h.date] = h.localName || h.name; });
    festivosCache[anio] = mapa;
    return mapa;
  } catch (e) {
    return {};
  }
}

async function render() {
  const mes = fecha.getMonth();
  const anio = fecha.getFullYear();
  const hoy = new Date();

  const festivos = await obtenerFestivos(anio);

  const nombres = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  const inicio = (primerDia.getDay() + 6) % 7;
  const diasMesAnterior = new Date(anio, mes, 0).getDate();

  // Festivos laborables del mes (solo los que caen en lunes-viernes)
  const festivosDelMes = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const fechaStr = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (festivos[fechaStr]) {
      const diaSemana = new Date(anio, mes, d).getDay();
      if (diaSemana !== 0 && diaSemana !== 6) {
        festivosDelMes.push({ dia: d, nombre: festivos[fechaStr], fecha: fechaStr });
      }
    }
  }

  contenedor.innerHTML = `
    <div class="cal-header">
      <button id="prev" title="Mes anterior">&#8249;</button>
      <div class="cal-titulo">
        <h2 id="mes-nombre">${nombres[mes]} ${anio}</h2>
        <span class="cal-subtitulo">Calendario laboral · Granada</span>
      </div>
      <button id="next" title="Mes siguiente">&#8250;</button>
    </div>

    <div class="cal-leyenda">
      <span class="leyenda-item"><span class="leyenda-color hoy-color"></span>Hoy</span>
      <span class="leyenda-item"><span class="leyenda-color festivo-color"></span>Festivo</span>
      <span class="leyenda-item"><span class="leyenda-color finde-color"></span>Fin de semana</span>
      <span class="leyenda-item"><span class="leyenda-color laboral-color"></span>Laborable</span>
    </div>

    <div class="dias-semana">
      <div>Lun</div><div>Mar</div><div>Mié</div>
      <div>Jue</div><div>Vie</div>
      <div class="finde-header">Sáb</div>
      <div class="finde-header">Dom</div>
    </div>

    <div class="dias" id="dias-grid"></div>

    ${festivosDelMes.length > 0 ? `
    <div class="cal-festivos-lista">
      <h4>Festivos este mes</h4>
      <ul>
        ${festivosDelMes.map(f => {
          const d = new Date(anio, mes, f.dia);
          const diaNombre = d.toLocaleDateString('es-ES', { weekday: 'long' });
          return `<li>
            <span class="festivo-bullet"></span>
            <strong>${f.dia} · ${diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1)}</strong>
            <span class="festivo-nombre-lista">${f.nombre}</span>
          </li>`;
        }).join('')}
      </ul>
    </div>` : ''}

    <div class="cal-footer">
      <span id="cal-info-mes"></span>
    </div>

    <div id="cal-tooltip"></div>
  `;

  // ---- RELLENAR GRID ----
  const diasEl = document.getElementById("dias-grid");

  // Días del mes anterior (relleno)
  for (let i = 0; i < inicio; i++) {
    const div = document.createElement("div");
    div.textContent = diasMesAnterior - inicio + 1 + i;
    div.classList.add("dia-otro-mes");
    diasEl.appendChild(div);
  }

  // Días del mes actual
  let diasLaborables = 0;
  let diasFestivos = 0;

  for (let d = 1; d <= ultimoDia; d++) {
    const div = document.createElement("div");
    const diaSemana = new Date(anio, mes, d).getDay();
    const fechaStr = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const esFestivo = !!festivos[fechaStr];
    const esFinde = diaSemana === 0 || diaSemana === 6;
    const esHoy = d === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear();

    div.innerHTML = `<span class="num-dia">${d}</span>`;

    if (esFestivo && !esFinde) {
      div.classList.add("festivo");
      div.setAttribute("data-festivo", festivos[fechaStr]);
      div.innerHTML += `<span class="etiqueta-festivo">${festivos[fechaStr]}</span>`;
      diasFestivos++;
    } else if (esFinde) {
      div.classList.add("finde");
      if (esFestivo) {
        div.classList.add("finde-festivo");
        div.setAttribute("data-festivo", festivos[fechaStr]);
      }
    } else {
      div.classList.add("laborable");
      diasLaborables++;
    }

    if (esHoy) div.classList.add("hoy");

    diasEl.appendChild(div);
  }

  // Días del mes siguiente (relleno)
  const totalCeldas = inicio + ultimoDia;
  const celdasRestantes = totalCeldas % 7 === 0 ? 0 : 7 - (totalCeldas % 7);
  for (let i = 1; i <= celdasRestantes; i++) {
    const div = document.createElement("div");
    div.textContent = i;
    div.classList.add("dia-otro-mes");
    diasEl.appendChild(div);
  }

  // Resumen del mes
  document.getElementById("cal-info-mes").textContent =
    `${diasLaborables} días laborables · ${diasFestivos} festivo${diasFestivos !== 1 ? 's' : ''} laborable${diasFestivos !== 1 ? 's' : ''} · ${diasLaborables * 8}h teóricas`;

  // ---- TOOLTIP PERSONALIZADO ----
  const tooltip = document.getElementById("cal-tooltip");

  diasEl.querySelectorAll("[data-festivo]").forEach(dia => {
    dia.addEventListener("mouseenter", () => {
      tooltip.textContent = dia.getAttribute("data-festivo");
      tooltip.classList.add("visible");
    });
    dia.addEventListener("mousemove", (e) => {
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top  = `${e.clientY - 36}px`;
    });
    dia.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  });

  // Navegación
  document.getElementById("prev").onclick = () => {
    fecha.setMonth(fecha.getMonth() - 1);
    render();
  };
  document.getElementById("next").onclick = () => {
    fecha.setMonth(fecha.getMonth() + 1);
    render();
  };
}

render();
