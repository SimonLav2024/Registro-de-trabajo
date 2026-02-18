const contenedor = document.getElementById("dark-calendario");

// Festivos nacionales España 2026
const festivos2026 = {
  "1-0": "Año Nuevo",
  "6-0": "Reyes",
  "3-3": "Viernes Santo",
  "1-4": "Día del Trabajo",
  "15-7": "Asunción",
  "12-9": "Fiesta Nacional",
  "1-10": "Todos los Santos",
  "6-11": "Día Constitución",
  "8-11": "Inmaculada",
  "25-11": "Navidad"
};

let fecha = new Date();

function render() {
  contenedor.innerHTML = `
    <div class="header">
      <button id="prev">◀</button>
      <h2 id="mes"></h2>
      <button id="next">▶</button>
    </div>

    <div class="dias-semana">
      <div>Lun</div><div>Mar</div><div>Mie</div>
      <div>Jue</div><div>Vie</div><div>Sab</div><div>Dom</div>
    </div>

    <div class="dias"></div>
  `;

  const mesEl = document.getElementById("mes");
  const diasEl = contenedor.querySelector(".dias");

  const mes = fecha.getMonth();
  const anio = fecha.getFullYear();

  const nombres = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                   "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  mesEl.textContent = `${nombres[mes]} ${anio}`;

  // Primer día de la semana (lunes = 0)
  const primerDiaIndex = new Date(anio, mes, 1).getDay();
  const inicio = (primerDiaIndex + 6) % 7; // Ajuste para lunes

  const ultimoDia = new Date(anio, mes + 1, 0).getDate();

  diasEl.innerHTML = "";

  for (let i = 0; i < inicio; i++) {
    diasEl.innerHTML += "<div></div>";
  }

  for (let d = 1; d <= ultimoDia; d++) {
    const div = document.createElement("div");
    div.textContent = d;

    const key = `${d}-${mes}`;
    const hoy = new Date();

    if (d === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear()) {
      div.classList.add("hoy");
    } else if (festivos2026[key]) {
      div.classList.add("festivo");
      div.title = festivos2026[key];
    }

    diasEl.appendChild(div);
  }

  document.getElementById("prev").onclick = () => {
    fecha.setMonth(fecha.getMonth() - 1);
    render();
  };

  document.getElementById("next").onclick = () => {
    fecha.setMonth(fecha.getMonth() + 1);
    render();
  };
  const inputMes = document.getElementById("mes-input");
}

render();
