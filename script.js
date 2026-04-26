// =====================================================
// REGISTRO DE TRABAJO - SISTEMA DE GESTIÓN DE HORAS
// =====================================================

// =====================================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN
// =====================================================

/**
 * Cliente Supabase
 * Evita error de redeclaración usando 'supabaseClient' en lugar de 'supabase'
 */
const supabaseClient = window.supabase.createClient(
  "https://vdtkwjtrijgqcjgwviph.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdGt3anRyaWpncWNqZ3d2aXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjgzNDksImV4cCI6MjA4Njc0NDM0OX0.HIOzqWe564j3-xbkRcwD1J5DR0XcFZ3nrwXazOOV_3w"
);

/**
 * Referencias a elementos del DOM principales
 */
const formulario = document.getElementById("formulario");
const tabla = document.getElementById("tabla-registros");


// =====================================================
// 1.2 AUTENTICACIÓN
// =====================================================

/**
 * Comprueba si hay sesión activa al cargar la página
 * Si hay sesión: muestra la app directamente
 * Si no hay sesión: muestra pantalla de login
 */
async function comprobarSesion() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    mostrarApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
}

/**
 * Oculta login y muestra la app principal
 */
function mostrarApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
  cargarRegistros();
}

/**
 * Evento: botón de login
 * Autentica con Supabase usando email y contraseña
 */
document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    document.getElementById('login-error').style.display = 'block';
    return;
  }

  mostrarApp();
});

// Arrancar comprobando sesión
comprobarSesion();



// =====================================================
// 2. GESTIÓN DE ESTADO
// =====================================================

/**
 * Columna actual para ordenación
 * Valores: 'fecha', 'entrada', 'salida', 'lugar' (según headers disponibles)
 * Por defecto: 'fecha' (ordena por fecha más reciente primero)
 */
let sortColumn = 'fecha';

/**
 * Dirección de ordenación
 * true = ascendente (A→Z, antiguo→nuevo)
 * false = descendente (Z→A, nuevo→antiguo) [por defecto]
 */
let sortAscending = false;

/**
 * ID del registro actualmente en modo edición
 * null cuando no hay una fila en edición
 */
let editingId = null;

/**
 * Copia de todos los registros cargados desde Supabase
 * Se utiliza como referencia para exportación y análisis
 */
let lastData = [];

/**
 * Registros filtrados del mes seleccionado
 * Se utiliza para mostrar en tabla y generar PDF
 */
let registrosMesActual = [];

/**
 * Mes actualmente seleccionado en el selector
 * Formato: YYYY-MM (ej: "2025-02")
 * Por defecto: mes actual
 */
let mesSeleccionado = new Date().toISOString().slice(0, 7);


// =====================================================
// 3. FUNCIONES AUXILIARES - FORMATEO Y VALIDACIÓN
// =====================================================

/**
 * Calcula las horas totales entre entrada y salida
 * Soporta turnos nocturnos que cruzan la medianoche
 * @param {string} entrada - Hora de entrada en formato HH:MM
 * @param {string} salida  - Hora de salida en formato HH:MM
 * @return {number} Total de horas trabajadas (con decimales)
 */
function calcularHorasTotales(entrada, salida) {
  const [hE, mE] = entrada.split(':').map(Number);
  const [hS, mS] = salida.split(':').map(Number);

  let minutosEntrada = hE * 60 + mE;
  let minutosSalida = hS * 60 + mS;

  // Si la salida es igual o anterior a la entrada, el turno cruzó medianoche
  if (minutosSalida <= minutosEntrada) {
    minutosSalida += 24 * 60;
  }

  const totalMinutos = minutosSalida - minutosEntrada;
  return parseFloat((totalMinutos / 60).toFixed(2));
}

/**
 * Convierte una fecha en string a nombre del día en español capitalizado
 * @param {string} fechaStr - Fecha en formato YYYY-MM-DD
 * @return {string} Nombre del día (ej: "Lunes", "Martes", etc.)
 */
function nombreDiaSemana(fechaStr) {
  if (!fechaStr) return "";
  const d = new Date(fechaStr);
  let dia = d.toLocaleDateString('es-ES', { weekday: 'long' });
  return dia.charAt(0).toUpperCase() + dia.slice(1);
}

/**
 * Formatea una fecha a formato legible DD/MM/YYYY
 * @param {string} fechaStr - Fecha en formato YYYY-MM-DD
 * @return {string} Fecha formateada (ej: "15/02/2025")
 */
function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const d = new Date(fechaStr);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Extrae solo HH:MM de un string de tiempo
 * @param {string} horaStr - Hora en formato HH:MM[:SS]
 * @return {string} Hora formateada (ej: "14:30")
 */
function formatearHora(horaStr) {
  if (!horaStr) return "";
  return horaStr.slice(0, 5);
}

/**
 * Verifica si hoy es el último día del mes
 * Se utiliza para activar exportación automática de PDF al fin de mes
 * @return {boolean} true si es último día del mes
 */
function esUltimoDia() {
  const hoy = new Date();
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return hoy.getDate() === ultimo;
}

/**
 * Genera un documento PDF con los registros de horas
 * Utiliza jsPDF + plugin autoTable para formato de tabla
 * 
 * @param {Array} registros - Array de objetos registro a incluir en PDF
 * @param {boolean} download - Si true, descarga automáticamente el archivo [default: false]
 * @param {boolean} preview - Si true, abre vista previa en nueva pestaña [default: true]
 * @param {string} mes - Mes en formato YYYY-MM para incluir en nombre del archivo [default: mes actual]
 */
function generarPdfRegistros(registros, download = false, preview = true, mes = null) {
  // Obtener constructor de jsPDF desde window
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Crear nombre del archivo y obtener texto del mes
  const mesParaNombre = mes || new Date().toISOString().slice(0, 7);
  const [year, month] = mesParaNombre.split('-');
  const fecha = new Date(year, parseInt(month, 10) - 1);
  const nombreMesTexto = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const nombre = `Registro de horas de trabajo del mes de ${nombreMesTexto}.pdf`;
  
  // Agregar título con el mes al PDF
  const tituloMes = `Registro de Horas - ${nombreMesTexto.charAt(0).toUpperCase() + nombreMesTexto.slice(1)}`;
  doc.setFontSize(16);
  doc.text(tituloMes, 105, 15, { align: 'center' });
  
  // Volver a font size normal para la tabla
  doc.setFontSize(12);
  
  // Definir encabezados de tabla
  const cabecera = ['Fecha', 'Día', 'Entrada', 'Salida', 'Lugar', 'Horas'];

  // Definir total de horas del mes sumando 'horas_totales' de cada registro
  const totalMes = registros.reduce((total, r) => total + (Number(r.horas_totales) || 0), 0);
  
  // Mapear registros a filas de tabla
  const filas = registros.map(r => {

    // ---- CALCULAR TOTAL DE HORAS DEL MES ----
    let totalMes = 0;
    registros.forEach(r => {
      totalMes += Number(r.horas_totales) || 0;
    });

    const dia = nombreDiaSemana(r.fecha);
    return [
      r.fecha,
      dia,
      r.hora_entrada.slice(0, 5),
      r.hora_salida.slice(0, 5),
      r.lugar_trabajo,
      r.horas_totales ?? ''
    ];
  });
  
  // Generar tabla en el PDF (con marginTop para dejar espacio al título)
  doc.autoTable({ 
    head: [cabecera], 
    body: filas,
    startY: 25
  });

  // ---- AÑADIR TOTAL DE HORAS AL FINAL DE LA TABLA ----
   const finalY = doc.lastAutoTable.finalY || 30;

  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text(`Total de horas del mes: ${totalMes} h`, 14, finalY + 10);
  doc.setFont(undefined, 'normal');

  // Establecer propiedades del documento
  doc.setProperties({ title: nombre });
  
  // Convertir PDF a Blob para permitir descarga/visualización
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  
  // Abrir en nueva pestaña si preview está activado
  if (preview) {
    window.open(blobUrl, '_blank');
  }
  
  // Descargar automáticamente si download está activado
  if (download) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    
    // Liberar recursos de Blob después de completar descarga
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    }, 1000);
  }
}

/**
 * Genera un PDF de resumen con horas trabajadas y horas restantes del mes
 */
async function generarPdfResumen(registros, download = false, preview = true, mes = null) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const mesParaNombre = mes || new Date().toISOString().slice(0, 7);
  const [year, month] = mesParaNombre.split('-').map(Number);
  const fecha = new Date(year, month - 1);
  const nombreMesTexto = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
  const nombre = `Resumen de horas del mes de ${nombreMesTexto}.pdf`;

  // ---- FESTIVOS GRANADA (nacionales + autonómicos + locales) ----
  // Datos oficiales hardcodeados, sin depender de la API
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
    },
    "2025": {
      "2025-01-01": "Año Nuevo",
      "2025-01-06": "Epifanía del Señor (Reyes)",
      "2025-02-28": "Día de Andalucía",
      "2025-04-17": "Jueves Santo",
      "2025-04-18": "Viernes Santo",
      "2025-05-01": "Día del Trabajo",
      "2025-06-19": "Corpus Christi (local)",
      "2025-08-15": "Asunción de la Virgen",
      "2025-10-12": "Fiesta Nacional de España",
      "2025-11-01": "Todos los Santos",
      "2025-12-06": "Día de la Constitución",
      "2025-12-08": "Inmaculada Concepción",
      "2025-12-25": "Navidad",
    }
  };

  // Obtener festivos del año o fallback a la API
  let festivosMap = {};
  const anioStr = String(year);
  if (FESTIVOS_GRANADA[anioStr]) {
    festivosMap = FESTIVOS_GRANADA[anioStr];
  } else {
    try {
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ES`);
      const holidays = await response.json();
      holidays.forEach(h => { festivosMap[h.date] = h.localName || h.name; });
    } catch (e) {}
  }

  const festivos = new Set(Object.keys(festivosMap));

  // Festivos del mes con fecha formateada, nombre y tipo
  const festivosMes = Object.entries(festivosMap)
    .filter(([f]) => f.startsWith(`${year}-${String(month).padStart(2, '0')}`))
    .map(([f, nombreFestivo]) => {
      const d = new Date(f);
      const diaSemana = d.getDay();
      const esFinde = diaSemana === 0 || diaSemana === 6;
      const fechaFormateada = d.toLocaleDateString('es-ES', {
        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
      });
      return [fechaFormateada, nombreFestivo, esFinde ? 'Cae en fin de semana' : 'Cae en laborable. Festivo'];
    });

  // ---- CALCULAR DÍAS LABORABLES ----
  const diasDelMes = new Date(year, month, 0).getDate();
  let diasLaborables = 0;

  for (let d = 1; d <= diasDelMes; d++) {
    const f = new Date(year, month - 1, d);
    const diaSemana = f.getDay();
    const fechaStr = f.toISOString().slice(0, 10);
    if (diaSemana !== 0 && diaSemana !== 6 && !festivos.has(fechaStr)) {
      diasLaborables++;
    }
  }

  const horasTeoricas = diasLaborables * 8;
  const horasTrabajadas = registros.reduce((t, r) => t + (Number(r.horas_totales) || 0), 0);
  const diferencia = horasTeoricas - horasTrabajadas;

  // ---- TÍTULO ----
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Resumen de Horas', 105, 18, { align: 'center' });
  doc.setFontSize(13);
  doc.setFont(undefined, 'normal');
  doc.text(nombreMesTexto.charAt(0).toUpperCase() + nombreMesTexto.slice(1), 105, 26, { align: 'center' });

  // ---- BLOQUE RESUMEN PRINCIPAL ----
  doc.autoTable({
    startY: 38,
    head: [['Concepto', 'Valor']],
    body: [
      ['Días laborables del mes', `${diasLaborables} días`],
      ['Horas teóricas del mes (8h/día)', `${horasTeoricas} h`],
      ['Horas trabajadas', `${horasTrabajadas} h`],
      [
        diferencia > 0 ? 'Horas restantes por trabajar' : diferencia < 0 ? 'Horas extra realizadas' : 'Estado',
        diferencia > 0 ? `${diferencia} h` : diferencia < 0 ? `${Math.abs(diferencia)} h` : 'Mes completado exactamente'
      ],
    ],
    styles: { fontSize: 11, cellPadding: 5 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center' } },
    didParseCell: function (data) {
      if (data.row.index === 3) {
        if (diferencia > 0) {
          data.cell.styles.textColor = [150, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        } else if (diferencia < 0) {
          data.cell.styles.textColor = [0, 120, 0];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [0, 0, 180];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  // ---- FESTIVOS DEL MES ----
  const yFestivos = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0);
  doc.text('Festivos del mes', 14, yFestivos);
  doc.setFont(undefined, 'normal');

  let yDespuesFestivos;
  if (festivosMes.length > 0) {
    doc.autoTable({
      startY: yFestivos + 4,
      head: [['Fecha', 'Festivo', 'Tipo']],
      body: festivosMes,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [231, 76, 60], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 90 },
        2: { cellWidth: 30, halign: 'center' }
      },
      didParseCell: function (data) {
        if (data.column.index === 2 && data.section === 'body') {
          if (data.cell.raw === 'Fin de semana') {
            data.cell.styles.textColor = [150, 150, 150];
            data.cell.styles.fontSize = 8;
          } else {
            data.cell.styles.textColor = [180, 0, 0];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    yDespuesFestivos = doc.lastAutoTable.finalY;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('No hay festivos este mes.', 14, yFestivos + 10);
    yDespuesFestivos = yFestivos + 10;
  }

  // ---- NOTA AL PIE ----
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Generado el ${new Date().toLocaleDateString('es-ES')} · Resumen de horas trabajadas · Festivos nacionales, autonómicos y locales de Granada`,
    105, yDespuesFestivos + 14, { align: 'center' }
  );

  // ---- OUTPUT ----
  doc.setProperties({ title: nombre });
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  if (preview) window.open(blobUrl, '_blank');

  if (download) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(blobUrl); document.body.removeChild(a); }, 1000);
  }
}

// =====================================================
// CALCULO HORAS TEORICAS MES - ANDALUCIA
// =====================================================

async function calcularHorasFaltantes(registrosMes, mesSeleccionado) {

  if (!mesSeleccionado) return;

  const [year, month] = mesSeleccionado.split('-').map(Number);

  // Obtener festivos nacionales España desde API pública
  const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ES`);
  const holidays = await response.json();

  const festivos = new Set(
    holidays.map(h => h.date)
  );

  const diasDelMes = new Date(year, month, 0).getDate();

  let diasLaborables = 0;

  for (let d = 1; d <= diasDelMes; d++) {
    const fecha = new Date(year, month - 1, d);
    const diaSemana = fecha.getDay();
    const fechaStr = fecha.toISOString().slice(0, 10);

    if (diaSemana !== 0 && diaSemana !== 6 && !festivos.has(fechaStr)) {
      diasLaborables++;
    }
  }

  const horasTeoricas = diasLaborables * 8;

  let horasTrabajadas = 0;
  registrosMes.forEach(r => {
    horasTrabajadas += Number(r.horas_totales) || 0;
  });

  const faltan = horasTeoricas - horasTrabajadas;

  let info = document.getElementById('horas-faltantes');

  if (!info) {
    info = document.createElement('div');
    info.id = 'horas-faltantes';
    info.style.marginTop = '8px';
    info.style.fontWeight = 'bold';
    // document.getElementById('totales-mes').after(info);
  }

  if (faltan > 0) {
    info.textContent = `Te faltan ${faltan} horas para completar el mes.`;
    info.style.color = 'darkred';
  } else if (faltan < 0) {
    info.textContent = `Has hecho ${Math.abs(faltan)} horas extra este mes.`;
    info.style.color = 'green';
  } else {
    info.textContent = `Has completado exactamente las horas del mes.`;
    info.style.color = 'blue';
  }
}


// =====================================================
// 4. FUNCIÓN PRINCIPAL DE CARGA DE DATOS
// =====================================================

/**
 * Carga todos los registros desde Supabase y actualiza la interfaz
 * 
 * Tareas:
 * 1. Obtiene todos los registros de la BD
 * 2. Construye selector de meses disponibles
 * 3. Filtra registros por mes seleccionado
 * 4. Calcula totales de horas del mes
 * 5. Genera tabla HTML con registros
 * 6. Activa exportación automática si es último día del mes
 * 
 * Se ejecuta al cargar página y después de cualquier operación CRUD
 */
async function cargarRegistros() {
  // Obtener todos los registros ordenados según columna y dirección seleccionadas
  const { data, error } = await supabaseClient
    .from("registros_trabajo")
    .select("*")
    .order(sortColumn, { ascending: sortAscending });

  // Validar que la consulta fue exitosa
  if (error) {
    alert("Error cargando datos");
    return;
  }

  // Limpiar tabla actual
  tabla.innerHTML = "";
  lastData = data || [];

  // ---- PASO 1: CONSTRUIR SELECTOR DE MESES ----
  const mesesDisponibles = new Set();
  data.forEach(r => {
    const mes = r.fecha.slice(0, 7); // Extraer YYYY-MM
    mesesDisponibles.add(mes);
  });
  
  const mesesOrdenados = Array.from(mesesDisponibles).sort().reverse();
  
  const selector = document.getElementById('selector-mes');
  selector.innerHTML = '';
  
  mesesOrdenados.forEach(mes => {
    const [year, month] = mes.split('-');
    const fecha = new Date(year, parseInt(month, 10) - 1);
    const nombreMes = fecha.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    
    const option = document.createElement('option');
    option.value = mes;
    option.textContent = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
    
    // Pre-seleccionar mes actual si existe
    if (mes === mesSeleccionado) option.selected = true;
    
    selector.appendChild(option);
  });

  // Manejar caso de tabla vacía
  if (!data || data.length === 0) {
    tabla.innerHTML = '<tr><td colspan="5">No hay registros</td></tr>';
    document.getElementById('totales-mes').textContent = '';
    return;
  }

  // ---- PASO 2: FILTRAR REGISTROS POR MES SELECCIONADO ----
  const registrosMes = data.filter(r => r.fecha.startsWith(mesSeleccionado));
  registrosMesActual = registrosMes; // Guardar para exportación PDF
  calcularHorasFaltantes(registrosMes, mesSeleccionado);


  // ---- PASO 3: GENERAR PDF AUTOMÁTICO SI ES ÚLTIMO DÍA DEL MES ----
  // if (esUltimoDia()) {
  //   generarPdfRegistros(registrosMes, true, true, mesSeleccionado);
  // }

  // ---- PASO 4: CALCULAR Y MOSTRAR TOTALES DEL MES ----
  // let totalMes = 0;
  // registrosMes.forEach(r => {
  //   totalMes += r.horas_totales || 0;
  // });
  
  // const [year, month] = mesSeleccionado.split('-');
  // const fecha = new Date(year, parseInt(month, 10) - 1);
  // const nombreMes = fecha.toLocaleString('es-ES', { month: 'long' });
  // document.getElementById('totales-mes').textContent = 
  //   `Horas totales del mes de ${nombreMes} del ${year} => ${totalMes}h`;

  // ---- PASO 5: MOSTRAR REGISTROS DEL MES EN TABLA ----
  if (registrosMes.length === 0) {
    tabla.innerHTML = '<tr><td colspan="6">No hay registros en este mes</td></tr>';
    return;
  }

  registrosMes.forEach(registro => {
    const dia = nombreDiaSemana(registro.fecha);
    const fechaFormateada = formatearFecha(registro.fecha);
    
    const fila = `
      <tr>
        <td>${fechaFormateada} ${dia ? '(' + dia + ')' : ''}</td>
        <td>${formatearHora(registro.hora_entrada)}</td>
        <td>${formatearHora(registro.hora_salida)}</td>
        <td>${registro.lugar_trabajo}</td>
        <td>${registro.horas_totales ?? "-"}</td>
        <td>
          <button class="edit-btn" data-id="${registro.id}" data-fecha="${registro.fecha}" data-entrada="${registro.hora_entrada}" data-salida="${registro.hora_salida}" data-lugar="${registro.lugar_trabajo}">Modificar</button>
          <button class="delete-btn" data-id="${registro.id}">Borrar</button>
        </td>
      </tr>
    `;
    tabla.innerHTML += fila;
  });
}


// =====================================================
// 5. GESTORES DE EVENTOS
// =====================================================

// ---- 5.1 EVENTO: ENVIAR FORMULARIO (CREAR NUEVO REGISTRO) ----
/**
 * Captura envío del formulario y crea nuevo registro en Supabase
 * 
 * Proceso:
 * 1. Previene recarga de página por defecto
 * 2. Obtiene valores de inputs (fecha, entrada, salida, lugar)
 * 3. Calcula horas totales (con soporte para turnos nocturnos)
 * 4. Inserta en tabla 'registros_trabajo'
 * 5. Limpia formulario
 * 6. Recarga tabla para mostrar nuevo registro
 */
formulario.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fecha = document.getElementById("fecha").value;
  const entrada = document.getElementById("entrada").value;
  const salida = document.getElementById("salida").value;
  const lugar = document.getElementById("lugar").value;

  // Calcular horas totales correctamente, incluso si el turno cruza medianoche
  const horas_totales = calcularHorasTotales(entrada, salida);

  const { data: insertData, error: insertError } = await supabaseClient
    .from("registros_trabajo")
    .insert([
      {
        fecha: fecha,
        hora_entrada: entrada,
        hora_salida: salida,
        lugar_trabajo: lugar,
        horas_totales: Number(horas_totales)
      }
    ])
    .select();

  // Limpiar formulario y recargar tabla
  formulario.reset();
  cargarRegistros();
});

// ---- 5.2 EVENTO: ORDENACIÓN POR CLIC EN ENCABEZADOS ----
/**
 * Permite ordenar tabla haciendo clic en los encabezados de columna
 * 
 * Comportamiento:
 * - Primer clic: ordena ascendente
 * - Segundo clic en mismo encabezado: invierte dirección
 * - Clic en otro encabezado: ordena por nueva columna (ascendente)
 */
document.querySelectorAll('th[data-column]').forEach(th => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    const col = th.getAttribute('data-column');
    
    if (sortColumn === col) {
      // Mismo encabezado: invertir dirección
      sortAscending = !sortAscending;
    } else {
      // Nuevo encabezado: usar orden ascendente
      sortColumn = col;
      sortAscending = true;
    }
    
    cargarRegistros();
  });
});

// ---- 5.3 EVENTO: SELECTOR DE MES ----
/**
 * Permite cambiar mes visible en tabla
 * 
 * Al cambiar selección:
 * 1. Actualiza variable global 'mesSeleccionado'
 * 2. Recarga tabla con registros del nuevo mes
 * 3. Actualiza totales y PDF para nuevo mes
 */
document.getElementById('selector-mes').addEventListener('change', (e) => {
  mesSeleccionado = e.target.value;
  cargarRegistros();
});

// ---- 5.4 EVENTO: BOTÓN "VER PDF" (VISTA PREVIA) ----
/**
 * Abre vista previa del PDF en nueva pestaña
 * Muestra registros del mes actualmente seleccionado
 * 
 * Validación: alerta si no hay datos en el mes
 */
document.getElementById('preview-pdf').addEventListener('click', () => {
  if (registrosMesActual && registrosMesActual.length) {
    generarPdfRegistros(registrosMesActual, false, true, mesSeleccionado);
  } else {
    alert('No hay datos para exportar');
  }
});

// ---- 5.5 EVENTO: BOTÓN "DESCARGAR PDF" ----
/**
 * Descarga PDF del mes seleccionado
 * 
 * Proceso:
 * 1. Valida que existan registros en el mes
 * 2. Genera PDF con nombre: "Registro de horas de trabajo del mes de [mes].pdf"
 * 3. Descarga automáticamente al dispositivo del usuario
 */
document.getElementById('download-pdf').addEventListener('click', () => {
  if (registrosMesActual && registrosMesActual.length) {
    generarPdfRegistros(registrosMesActual, true, false, mesSeleccionado);
  } else {
    alert('No hay datos para exportar');
  }
});

// ---- EVENTO: BOTÓN "VER PDF RESUMEN" ----
document.getElementById('preview-pdf-resumen').addEventListener('click', () => {
  if (registrosMesActual && registrosMesActual.length) {
    generarPdfResumen(registrosMesActual, false, true, mesSeleccionado);
  } else {
    alert('No hay datos para exportar');
  }
});

// ---- EVENTO: BOTÓN "DESCARGAR PDF RESUMEN" ----
document.getElementById('download-pdf-resumen').addEventListener('click', () => {
  if (registrosMesActual && registrosMesActual.length) {
    generarPdfResumen(registrosMesActual, true, false, mesSeleccionado);
  } else {
    alert('No hay datos para exportar');
  }
});

// ---- 5.6 EVENTO: BOTONES DE TABLA (MODIFICAR / GUARDAR / BORRAR) ----
/**
 * Gestiona todas las interacciones con filas de tabla
 * Utiliza event delegation para capturar clics en botones dinámicos
 * 
 * Flujos:
 * 
 * A) CLIC EN "MODIFICAR":
 *    1. Guarda ID de fila en edición
 *    2. Convierte celdas en inputs editables
 *    3. Cambia botón a "Guardar"
 * 
 * B) CLIC EN "GUARDAR":
 *    1. Valida que todos los campos estén rellenos
 *    2. Obtiene valores nuevos de los inputs
 *    3. Recalcula horas totales (con soporte para turnos nocturnos)
 *    4. Actualiza registro en Supabase
 *    5. Recarga tabla para mostrar cambios
 * 
 * C) CLIC EN "BORRAR":
 *    1. Solicita confirmación al usuario
 *    2. Si confirma: elimina registro de Supabase
 *    3. Recarga tabla
 * 
 * CORRECCIÓN: Se añade .trim() en las comparaciones de textContent para evitar
 * fallos por espacios invisibles al cambiar el texto del botón entre
 * "Modificar" y "Guardar". También se añade console.error para ver
 * el detalle del error de Supabase en consola (F12) si la actualización falla.
 */
tabla.addEventListener('click', async e => {
  if (e.target.classList.contains('edit-btn')) {
    const btn = e.target;
    const row = btn.closest('tr');
    
    if (btn.textContent.trim() === 'Modificar') {
      // ---- ENTRAR EN MODO EDICIÓN ----
      editingId = btn.dataset.id;
      const fecha = btn.dataset.fecha;
      const entrada = btn.dataset.entrada;
      const salida = btn.dataset.salida;
      const lugar = btn.dataset.lugar;
      
      // Convertir celdas a inputs editables
      row.cells[0].innerHTML = `<input type="date" value="${fecha}">`;
      row.cells[1].innerHTML = `<input type="time" value="${entrada.slice(0, 5)}">`;
      row.cells[2].innerHTML = `<input type="time" value="${salida.slice(0, 5)}">`;
      row.cells[3].innerHTML = `<input type="text" value="${lugar}">`;
      
      // Cambiar texto del botón
      btn.textContent = 'Guardar';
      
    } else if (btn.textContent.trim() === 'Guardar') {
      // ---- GUARDAR CAMBIOS ----
      const row2 = btn.closest('tr');
      const inputs = row2.querySelectorAll('input');
      
      const newFecha = inputs[0].value;
      const newEntrada = inputs[1].value;
      const newSalida = inputs[2].value;
      const newLugar = inputs[3].value;

      // Validación: todos los campos deben estar rellenos antes de guardar
      if (!newFecha || !newEntrada || !newSalida || !newLugar) {
        alert('Por favor completa todos los campos antes de guardar');
        return;
      }

      // Recalcular horas totales correctamente, incluso si el turno cruza medianoche
      const horas_totales = calcularHorasTotales(newEntrada, newSalida);
      
      // Actualizar en Supabase
      const { data: updateData, error: updateError } = await supabaseClient
        .from('registros_trabajo')
        .update({
          fecha: newFecha,
          hora_entrada: newEntrada,
          hora_salida: newSalida,
          lugar_trabajo: newLugar,
          horas_totales: horas_totales
        })
        .eq('id', editingId)
        .select(); // Necesario para que Supabase ejecute el update correctamente
      
      if (updateError) {
        console.error('Error al actualizar:', updateError);
        alert('Error al actualizar: ' + updateError.message);
        return;
      }
      
      // Limpiar estado y recargar tabla
      editingId = null;
      cargarRegistros();
    }
    
  } else if (e.target.classList.contains('delete-btn')) {
    // ---- BORRAR REGISTRO ----
    const id = e.target.dataset.id;
    
    if (confirm('¿Eliminar este registro?')) {
      const { error } = await supabaseClient
        .from('registros_trabajo')
        .delete()
        .eq('id', id);
      
      if (error) {
        alert('No se pudo borrar');
      } else {
        cargarRegistros();
      }
    }
  }
});

// =====================================================
// 6. MEJORAS DE USABILIDAD - BOTÓN DE SCROLL
// =====================================================

  const scrollBtn = document.getElementById("scroll-btn");

  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      scrollBtn.classList.add("show");
    } else {
      scrollBtn.classList.remove("show");
    }
  });

  scrollBtn.addEventListener("click", () => {
    document.querySelector("#formulario").scrollIntoView({
      behavior: "smooth"
    });
  });

 /**
 * Evento: botón de cerrar sesión
 * Cierra la sesión en Supabase y muestra la pantalla de login
 */
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  document.getElementById('main-content').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
});

// =====================================================
// 7. INICIALIZACIÓN - EJECUTARSE AL CARGAR LA PÁGINA
// =====================================================

// cargarRegistros();
