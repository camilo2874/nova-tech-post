import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Formatters ────────────────────────────────────────────────────────────

const COP = (n) =>
  `$${Math.round(Number(n ?? 0)).toLocaleString("es-CO")}`;

const FECHA = (f) =>
  f
    ? new Date(f).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })
    : "—";

const FECHA_CORTA = (f) =>
  f
    ? new Date(f).toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const RE_UUID_PDF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONCEPTO = (concepto) => {
  if (!concepto) return "—";
  const partes = concepto.trim().split(" ");
  if (partes.length === 2 && partes[0].toLowerCase() === "venta" && RE_UUID_PDF.test(partes[1])) {
    return "Ingreso por venta";
  }
  return concepto;
};

// ── Paleta corporativa (seria y formal) ───────────────────────────────────

const NAVY_DARK    = [15,  23,  42];   // Encabezado fondo oscuro
const NAVY         = [30,  58, 138];   // Encabezados de tabla, acentos
const NAVY_LIGHT   = [239, 246, 255];  // Fondo KPI azul
const SLATE        = [71,  85, 105];   // Texto secundario
const SLATE_LIGHT  = [248, 250, 252];  // Filas alternas
const SLATE_LINE   = [203, 213, 225];  // Bordes
const VERDE        = [5,  150, 105];   // Positivo
const VERDE_CLARO  = [209, 250, 229];  // Fondo positivo
const ROJO         = [185,  28,  28];  // Negativo
const ROJO_CLARO   = [254, 226, 226];  // Fondo negativo
const AMBER        = [146,  64,  14];  // Descuentos
const AMBER_CLARO  = [255, 251, 235];  // Fondo descuentos
const OSCURO       = [15,  23,  42];   // Texto principal
const BLANCO       = [255, 255, 255];

// ── Carga el logo de /logo.png como base64 ────────────────────────────────

async function _cargarLogo() {
  try {
    const res = await fetch("/logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Cabecera de primera página ────────────────────────────────────────────

function _header(doc, label, logoData) {
  const W = doc.internal.pageSize.getWidth();
  const HEADER_H = 38;

  // Fondo oscuro
  doc.setFillColor(...NAVY_DARK);
  doc.rect(0, 0, W, HEADER_H, "F");

  // Franja de acento inferior bicolor
  doc.setFillColor(...NAVY);
  doc.rect(0, HEADER_H, W * 0.55, 3, "F");
  doc.setFillColor(...VERDE);
  doc.rect(W * 0.55, HEADER_H, W * 0.45, 3, "F");

  // Área izquierda: logo + nombre empresa
  let textX = 14;
  if (logoData) {
    try {
      const logoW = 38;
      const logoH = 20;
      const logoY = (HEADER_H - logoH) / 2;
      doc.addImage(logoData, "PNG", 10, logoY, logoW, logoH, undefined, "FAST");
      textX = 10 + logoW + 8;
    } catch {
      // Fallback: solo texto
    }
  }

  doc.setTextColor(...BLANCO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("NOVA TECH", textX, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Sistema Punto de Venta", textX, 23);

  // Separador vertical tenue
  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.4);
  doc.line(W * 0.52, 7, W * 0.52, HEADER_H - 6);

  // Área derecha: título del reporte
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BLANCO);
  doc.text("REPORTE FINANCIERO", W - 14, 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(label, W - 14, 21, { align: "right", maxWidth: W * 0.44 });

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generado: ${new Date().toLocaleString("es-CO")}`,
    W - 14,
    29,
    { align: "right" }
  );
}

// ── Título de sección con acento lateral ──────────────────────────────────

function _seccionTitulo(doc, texto, y) {
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...NAVY);
  doc.rect(14, y - 3, 3.5, 10, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text(texto.toUpperCase(), 21, y + 4.5);

  doc.setDrawColor(...SLATE_LINE);
  doc.setLineWidth(0.4);
  doc.line(21, y + 7, W - 14, y + 7);

  return y + 14;
}

// ── Cajas de KPIs ─────────────────────────────────────────────────────────

function _kpiBox(doc, kpis, startY) {
  const W     = doc.internal.pageSize.getWidth();
  const marg  = 14;
  const gap   = 3;
  const cols  = kpis.length;
  const boxW  = (W - marg * 2 - gap * (cols - 1)) / cols;
  const boxH  = 27;

  kpis.forEach((k, i) => {
    const x = marg + i * (boxW + gap);

    // Fondo + borde
    doc.setFillColor(...(k.bg ?? SLATE_LIGHT));
    doc.setDrawColor(...SLATE_LINE);
    doc.setLineWidth(0.3);
    doc.rect(x, startY, boxW, boxH, "FD");

    // Franja de color superior
    doc.setFillColor(...(k.color ?? SLATE));
    doc.rect(x, startY, boxW, 3, "F");

    // Etiqueta
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE);
    doc.text(k.label.toUpperCase(), x + boxW / 2, startY + 11.5, {
      align: "center",
      maxWidth: boxW - 4,
    });

    // Valor
    doc.setFont("helvetica", "bold");
    doc.setFontSize(k.grande ? 11.5 : 9.5);
    doc.setTextColor(...(k.color ?? OSCURO));
    doc.text(k.valor, x + boxW / 2, startY + 22, {
      align: "center",
      maxWidth: boxW - 4,
    });
  });

  return startY + boxH + 5;
}

// ── Tabla de ventas ────────────────────────────────────────────────────────

function _tablaVentas(doc, ventas, startY) {
  const W = doc.internal.pageSize.getWidth();

  if (ventas.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text("Sin ventas registradas en este período.", 21, startY + 6);
    return startY + 14;
  }

  const totalVentas = ventas.reduce((s, v) => s + Number(v.total), 0);

  const body = ventas.map((v) => [
    FECHA(v.creado_en),
    v.usuarios?.nombre ?? "—",
    ((v.metodo_pago ?? "—").charAt(0).toUpperCase() + (v.metodo_pago ?? "—").slice(1)),
    (v.detalle_venta ?? [])
      .map((d) => `${d.productos?.nombre ?? "?"} ×${d.cantidad}`)
      .join(", ") || "—",
    COP(v.subtotal),
    Number(v.descuento ?? 0) > 0 ? COP(v.descuento) : "—",
    COP(v.total),
  ]);

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      overflow: "linebreak",
      lineColor: SLATE_LINE,
      lineWidth: 0.2,
      textColor: OSCURO,
      font: "helvetica",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: BLANCO,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: SLATE_LIGHT },
    columnStyles: {
      0: { cellWidth: 27 },
      1: { cellWidth: 25 },
      2: { cellWidth: 20 },
      3: { cellWidth: "auto" },
      4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 20, textColor: ROJO },
      6: { halign: "right", fontStyle: "bold", cellWidth: 24, textColor: VERDE },
    },
    head: [["Fecha / Hora", "Cajero", "Método", "Productos", "Subtotal", "Dcto.", "Total"]],
    body,
    foot: [[
      {
        content: `${ventas.length} venta${ventas.length !== 1 ? "s" : ""}`,
        colSpan: 4,
        styles: { fontStyle: "bold", fillColor: [226, 232, 240], textColor: OSCURO },
      },
      { content: "", styles: { fillColor: [226, 232, 240] } },
      { content: "", styles: { fillColor: [226, 232, 240] } },
      {
        content: COP(totalVentas),
        styles: { halign: "right", fontStyle: "bold", fillColor: [226, 232, 240], textColor: VERDE },
      },
    ]],
    footStyles: { fontSize: 7.5 },
    margin: { left: 14, right: 14 },
    tableWidth: W - 28,
  });

  return doc.lastAutoTable.finalY + 8;
}

// ── Tabla de movimientos ───────────────────────────────────────────────────

function _tablaMovimientos(doc, movimientos, startY, saldoInicial = 0) {
  const W = doc.internal.pageSize.getWidth();

  if (movimientos.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text("Sin movimientos de caja en este período.", 21, startY + 6);
    return startY + 14;
  }

  const totalIngresos = movimientos
    .filter((m) => m.tipo === "ingreso")
    .reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = movimientos
    .filter((m) => m.tipo === "retiro")
    .reduce((s, m) => s + Number(m.monto), 0);

  // Efectivo real = saldo de apertura + ingresos − egresos
  const efectivoFinal = saldoInicial + totalIngresos - totalEgresos;

  const body = movimientos.map((m) => [
    FECHA(m.creado_en),
    m.usuarios?.nombre ?? "—",
    m.tipo === "ingreso" ? "Ingreso" : "Egreso",
    CONCEPTO(m.concepto),
    COP(m.monto),
  ]);

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      overflow: "linebreak",
      lineColor: SLATE_LINE,
      lineWidth: 0.2,
      textColor: OSCURO,
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: BLANCO,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: SLATE_LIGHT },
    columnStyles: {
      0: { cellWidth: 27 },
      1: { cellWidth: 30 },
      2: { halign: "center", cellWidth: 18 },
      3: { cellWidth: "auto" },
      4: { halign: "right", fontStyle: "bold", cellWidth: 28 },
    },
    head: [["Fecha / Hora", "Usuario", "Tipo", "Concepto", "Monto"]],
    body,
    foot: [[
      {
        content: `${movimientos.length} movimiento${movimientos.length !== 1 ? "s" : ""}`,
        colSpan: 3,
        styles: { fontStyle: "bold", fillColor: [226, 232, 240], textColor: OSCURO },
      },
      {
        content: `Base: ${COP(saldoInicial)}  |  Ingresos: ${COP(totalIngresos)}  |  Egresos: ${COP(totalEgresos)}`,
        styles: { fontStyle: "bold", fillColor: [226, 232, 240], textColor: SLATE, halign: "right" },
      },
      {
        content: COP(efectivoFinal),
        styles: {
          halign: "right",
          fontStyle: "bold",
          fillColor: [226, 232, 240],
          textColor: efectivoFinal >= 0 ? VERDE : ROJO,
        },
      },
    ]],
    footStyles: { fontSize: 7 },
    didParseCell(d) {
      if (d.section === "body" && d.column.index === 2) {
        d.cell.styles.textColor = d.cell.raw === "Ingreso" ? VERDE : ROJO;
        d.cell.styles.fontStyle = "bold";
      }
      if (d.section === "body" && d.column.index === 4) {
        d.cell.styles.textColor = d.row.raw[2] === "Ingreso" ? VERDE : ROJO;
      }
    },
    margin: { left: 14, right: 14 },
    tableWidth: W - 28,
  });

  return doc.lastAutoTable.finalY + 8;
}

// ── Tabla de productos ─────────────────────────────────────────────────────

function _tablaProductos(doc, productos, startY) {
  const W = doc.internal.pageSize.getWidth();
  if (productos.length === 0) return startY;

  const body = productos.map((p, i) => [
    `${i + 1}`,
    p.nombre,
    p.cantidad.toLocaleString("es-CO"),
    COP(p.total),
  ]);

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: SLATE_LINE,
      lineWidth: 0.2,
      textColor: OSCURO,
    },
    headStyles: {
      fillColor: [6, 78, 59],
      textColor: BLANCO,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: {
      0: { halign: "center", cellWidth: 10, textColor: SLATE, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { halign: "center", cellWidth: 34 },
      3: { halign: "right", fontStyle: "bold", cellWidth: 36, textColor: VERDE },
    },
    head: [["#", "Producto", "Unidades Vendidas", "Total Generado"]],
    body,
    margin: { left: 14, right: 14 },
    tableWidth: W - 28,
  });

  return doc.lastAutoTable.finalY + 8;
}

// ── Tabla de ventas por categoría ──────────────────────────────────────────

function _tablaCategorias(doc, categorias, startY) {
  const W = doc.internal.pageSize.getWidth();
  if (categorias.length === 0) return startY;

  const totalGeneral = categorias.reduce((s, c) => s + Number(c.total), 0) || 1;

  const body = categorias.map((c) => [
    c.categoria,
    c.cantidad.toLocaleString("es-CO"),
    COP(c.total),
    `${((c.total / totalGeneral) * 100).toFixed(1)}%`,
  ]);

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: SLATE_LINE,
      lineWidth: 0.2,
      textColor: OSCURO,
    },
    headStyles: {
      fillColor: [146, 64, 14],
      textColor: BLANCO,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: [255, 251, 235] },
    columnStyles: {
      0: { cellWidth: "auto", fontStyle: "bold" },
      1: { halign: "center", cellWidth: 32 },
      2: { halign: "right", fontStyle: "bold", cellWidth: 36, textColor: AMBER },
      3: { halign: "right", cellWidth: 24, textColor: SLATE },
    },
    head: [["Categoría", "Unidades Vendidas", "Total Generado", "% del Total"]],
    body,
    margin: { left: 14, right: 14 },
    tableWidth: W - 28,
  });

  return doc.lastAutoTable.finalY + 8;
}

// ── Tabla de turnos ────────────────────────────────────────────────────────

function _tablaTurnos(doc, turnos, startY) {
  const W = doc.internal.pageSize.getWidth();
  if (turnos.length === 0) return startY;

  const body = turnos.map((t) => [
    t.usuarios?.nombre ?? "—",
    FECHA_CORTA(t.abierto_en),
    t.cerrado_en ? FECHA_CORTA(t.cerrado_en) : "Abierto",
    COP(t.monto_apertura),
    t.monto_cierre_efectivo != null ? COP(t.monto_cierre_efectivo) : "—",
    t.saldo_calculado_cierre != null ? COP(t.saldo_calculado_cierre) : "—",
  ]);

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: SLATE_LINE,
      lineWidth: 0.2,
      textColor: OSCURO,
    },
    headStyles: {
      fillColor: [14, 116, 144],
      textColor: BLANCO,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: [240, 249, 255] },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right", textColor: VERDE },
      5: { halign: "right", textColor: NAVY },
    },
    head: [["Cajero", "Apertura", "Cierre", "Monto Inicial", "Conteo Efectivo", "Saldo Sistema"]],
    body,
    margin: { left: 14, right: 14 },
    tableWidth: W - 28,
  });

  return doc.lastAutoTable.finalY + 8;
}

// ── Tabla de inventario: inversión por categoría ──────────────────────────

function _tablaInventarioCategorias(doc, categorias, startY) {
  const W = doc.internal.pageSize.getWidth();
  if (categorias.length === 0) return startY;

  const body = categorias.map((c) => [
    c.categoria,
    String(c.numProductos),
    c.cantidadActual.toLocaleString("es-CO"),
    COP(c.valorInvertido),
    COP(c.valorVentaPotencial),
    COP(c.gananciaPotencial),
  ]);

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineColor: SLATE_LINE,
      lineWidth: 0.2,
      textColor: OSCURO,
    },
    headStyles: {
      fillColor: [6, 78, 59],
      textColor: BLANCO,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    columnStyles: {
      0: { cellWidth: "auto", fontStyle: "bold" },
      1: { halign: "center", cellWidth: 18 },
      2: { halign: "right", cellWidth: 24 },
      3: { halign: "right", cellWidth: 30, textColor: VERDE },
      4: { halign: "right", cellWidth: 30, textColor: [124, 58, 237] },
      5: { halign: "right", cellWidth: 30, fontStyle: "bold" },
    },
    head: [["Categoría", "Prod.", "Cant. actual", "Inversión", "Valor a recibir", "Ganancia"]],
    body,
    didParseCell(d) {
      if (d.section === "body" && d.column.index === 5) {
        d.cell.styles.textColor = String(d.cell.raw).includes("-") ? ROJO : VERDE;
      }
    },
    margin: { left: 14, right: 14 },
    tableWidth: W - 28,
  });

  return doc.lastAutoTable.finalY + 8;
}

// ── Tabla de inventario: detalle por producto ─────────────────────────────

function _tablaInventarioProductos(doc, productos, startY) {
  const W = doc.internal.pageSize.getWidth();
  if (productos.length === 0) return startY;

  const body = productos.map((p) => [
    p.nombre,
    p.categoria,
    p.cantidadInicial.toLocaleString("es-CO") + (p.tieneHistorialInicial ? "" : " *"),
    p.cantidadActual.toLocaleString("es-CO"),
    COP(p.precioCompra),
    COP(p.precioVenta),
    COP(p.valorInvertido),
    COP(p.gananciaPotencial),
  ]);

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 },
      overflow: "linebreak",
      lineColor: SLATE_LINE,
      lineWidth: 0.2,
      textColor: OSCURO,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: BLANCO,
      fontStyle: "bold",
      fontSize: 6.5,
      cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
    },
    alternateRowStyles: { fillColor: SLATE_LIGHT },
    columnStyles: {
      0: { cellWidth: "auto", fontStyle: "bold" },
      1: { cellWidth: 26 },
      2: { halign: "right", cellWidth: 20 },
      3: { halign: "right", cellWidth: 20, fontStyle: "bold" },
      4: { halign: "right", cellWidth: 22 },
      5: { halign: "right", cellWidth: 22 },
      6: { halign: "right", cellWidth: 24 },
      7: { halign: "right", cellWidth: 24 },
    },
    head: [["Producto", "Categoría", "Cant. inicial", "Cant. actual", "P. compra", "P. venta", "Inversión", "Ganancia"]],
    body,
    foot: [[
      {
        content: `${productos.length} producto${productos.length !== 1 ? "s" : ""} — * sin historial de stock inicial (se muestra igual a la cantidad actual)`,
        colSpan: 8,
        styles: { fontStyle: "italic", fontSize: 6, fillColor: [226, 232, 240], textColor: SLATE },
      },
    ]],
    didParseCell(d) {
      if (d.section === "body" && d.column.index === 7) {
        d.cell.styles.textColor = String(d.cell.raw).includes("-") ? ROJO : VERDE;
      }
    },
    margin: { left: 14, right: 14 },
    tableWidth: W - 28,
  });

  return doc.lastAutoTable.finalY + 8;
}

// ── PDF del reporte de inventario (estructura distinta a los financieros) ──

async function _generarPdfInventario(reporte) {
  const { label, productos, categorias, resumen } = reporte;

  const logoData = await _cargarLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  _header(doc, label, logoData);
  let y = 47;

  y = _seccionTitulo(doc, "Resumen de inventario", y);
  y = _kpiBox(
    doc,
    [
      { label: "Productos", valor: String(resumen.totalProductos), bg: SLATE_LIGHT, color: SLATE },
      { label: "Unidades Actuales", valor: resumen.totalUnidadesActuales.toLocaleString("es-CO"), bg: NAVY_LIGHT, color: NAVY },
      { label: "Capital Invertido", valor: COP(resumen.totalInvertido), bg: VERDE_CLARO, color: VERDE, grande: true },
      { label: "Valor a Precio Venta", valor: COP(resumen.totalValorVenta), bg: [243, 232, 255], color: [124, 58, 237] },
      {
        label: "Ganancia Potencial",
        valor: COP(resumen.totalGananciaPotencial),
        bg:    resumen.totalGananciaPotencial >= 0 ? VERDE_CLARO : ROJO_CLARO,
        color: resumen.totalGananciaPotencial >= 0 ? VERDE       : ROJO,
        grande: true,
      },
    ],
    y
  );

  y += 2;

  if (resumen.productosSinHistorialInicial > 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...AMBER);
    doc.text(
      `Nota: ${resumen.productosSinHistorialInicial} producto(s) no tienen historial de stock inicial (se crearon antes de instalar el Kardex de inventario). Para esos se muestra cantidad inicial = cantidad actual.`,
      14,
      y,
      { maxWidth: doc.internal.pageSize.getWidth() - 28 }
    );
    y += 10;
  }

  y = _seccionTitulo(doc, `Inversión y ganancia potencial por categoría (${categorias.length})`, y);
  y = _tablaInventarioCategorias(doc, categorias, y);

  y = _seccionTitulo(doc, `Detalle de productos (${productos.length})`, y);
  _tablaInventarioProductos(doc, productos, y);

  _footerPaginas(doc, label);

  const fecha = new Date().toISOString().split("T")[0];
  doc.save(`reporte-inventario-${fecha}.pdf`);
}

// ── Footer en todas las páginas ────────────────────────────────────────────

function _footerPaginas(doc, label) {
  const total = doc.internal.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    doc.setDrawColor(...SLATE_LINE);
    doc.setLineWidth(0.4);
    doc.line(14, H - 12, W - 14, H - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...SLATE);
    doc.text(`NOVA TECH POS · ${label}`, 14, H - 6);
    doc.text(
      `Documento confidencial · Página ${i} de ${total}`,
      W - 14,
      H - 6,
      { align: "right" }
    );
  }
}

// ── Función principal exportada ───────────────────────────────────────────

/**
 * Genera y descarga el PDF del reporte.
 * @param {object} reporte  Objeto devuelto por reportesServicio
 */
export async function generarPdfReporte(reporte) {
  if (reporte.tipo === "inventario") {
    return _generarPdfInventario(reporte);
  }

  const { tipo, label, turno, turnos, ventas, movimientos, productosMasVendidos, ventasPorCategoria, resumen } =
    reporte;

  // Intentar cargar el logo antes de construir el PDF
  const logoData = await _cargarLogo();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // ── CABECERA ─────────────────────────────────────────────────────────────
  _header(doc, label, logoData);
  let y = 47;

  // ── RESUMEN EJECUTIVO ────────────────────────────────────────────────────
  y = _seccionTitulo(doc, "Resumen ejecutivo", y);

  y = _kpiBox(
    doc,
    [
      { label: "Total Ventas",    valor: COP(resumen.totalVentas),    bg: NAVY_LIGHT,  color: NAVY,  grande: true },
      { label: "Transacciones",   valor: String(resumen.cantidadVentas), bg: SLATE_LIGHT, color: SLATE },
      { label: "Ticket Promedio", valor: COP(resumen.ticketPromedio), bg: SLATE_LIGHT, color: SLATE },
      { label: "En Efectivo",     valor: COP(resumen.totalEfectivo),  bg: VERDE_CLARO, color: VERDE },
      { label: "Otros Medios",    valor: COP(resumen.totalOtrosMedios), bg: SLATE_LIGHT, color: SLATE },
    ],
    y
  );

  y = _kpiBox(
    doc,
    [
      { label: "Saldo Inicial",    valor: COP(resumen.saldoInicial),  bg: NAVY_LIGHT,  color: NAVY  },
      { label: "Ingresos Caja",    valor: COP(resumen.totalIngresos), bg: VERDE_CLARO,  color: VERDE },
      { label: "Egresos Caja",     valor: COP(resumen.totalEgresos),  bg: ROJO_CLARO,   color: ROJO  },
      { label: "Descuentos",       valor: COP(resumen.totalDescuentos), bg: AMBER_CLARO, color: AMBER },
      {
        label: "Balance Neto",
        valor: COP(resumen.efectivoEnCaja),
        bg:    resumen.efectivoEnCaja >= 0 ? VERDE_CLARO : ROJO_CLARO,
        color: resumen.efectivoEnCaja >= 0 ? VERDE       : ROJO,
      },
      {
        label: "Ganancia Neta",
        valor: COP(resumen.gananciaNeta),
        bg:    resumen.gananciaNeta >= 0 ? [243, 232, 255] : ROJO_CLARO,
        color: resumen.gananciaNeta >= 0 ? [124, 58, 237]  : ROJO,
        grande: true,
      },
    ],
    y
  );

  y += 2;

  // ── INFO DEL TURNO (solo tipo=turno) ─────────────────────────────────────
  if (tipo === "turno" && turno) {
    y = _seccionTitulo(doc, "Información del turno", y);

    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        lineColor: SLATE_LINE,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: SLATE_LIGHT,
        textColor: SLATE,
        fontStyle: "bold",
        fontSize: 7,
      },
      columnStyles: {
        2: { textColor: turno.cerrado_en ? VERDE : ROJO, fontStyle: "bold" },
        3: { halign: "right" },
        4: { halign: "right", textColor: VERDE },
        5: { halign: "right", textColor: NAVY },
      },
      head: [["Cajero", "Apertura", "Estado", "Monto Apertura", "Conteo Efectivo", "Saldo Sistema"]],
      body: [[
        turno.usuarios?.nombre ?? "—",
        FECHA(turno.abierto_en),
        turno.cerrado_en ? `Cerrado ${FECHA(turno.cerrado_en)}` : "Abierto",
        COP(turno.monto_apertura),
        turno.monto_cierre_efectivo != null ? COP(turno.monto_cierre_efectivo) : "—",
        turno.saldo_calculado_cierre != null ? COP(turno.saldo_calculado_cierre) : "—",
      ]],
      margin: { left: 14, right: 14 },
    });

    y = doc.lastAutoTable.finalY + 8;
  }

  // ── VENTAS ───────────────────────────────────────────────────────────────
  y = _seccionTitulo(doc, `Ventas registradas (${ventas.length})`, y);
  y = _tablaVentas(doc, ventas, y);

  // ── MOVIMIENTOS DE CAJA ──────────────────────────────────────────────────
  y = _seccionTitulo(doc, `Movimientos de caja (${movimientos.length})`, y);
  y = _tablaMovimientos(doc, movimientos, y, resumen.saldoInicial ?? 0);

  // ── PRODUCTOS MÁS VENDIDOS ───────────────────────────────────────────────
  if (productosMasVendidos.length > 0) {
    y = _seccionTitulo(doc, `Top ${productosMasVendidos.length} productos más vendidos`, y);
    y = _tablaProductos(doc, productosMasVendidos, y);
  }

  // ── VENTAS POR CATEGORÍA ─────────────────────────────────────────────────
  if (ventasPorCategoria && ventasPorCategoria.length > 0) {
    y = _seccionTitulo(doc, `Ventas por categoría (${ventasPorCategoria.length})`, y);
    y = _tablaCategorias(doc, ventasPorCategoria, y);
  }

  // ── TURNOS (reportes de rango) ───────────────────────────────────────────
  if (tipo !== "turno" && turnos && turnos.length > 0) {
    y = _seccionTitulo(doc, `Turnos de caja en el período (${turnos.length})`, y);
    _tablaTurnos(doc, turnos, y);
  }

  // ── FOOTER EN TODAS LAS PÁGINAS ──────────────────────────────────────────
  _footerPaginas(doc, label);

  // ── GUARDAR ──────────────────────────────────────────────────────────────
  const fecha = new Date().toISOString().split("T")[0];
  doc.save(`reporte-${tipo}-${fecha}.pdf`);
}
