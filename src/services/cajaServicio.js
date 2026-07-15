import { supabase } from "./supabaseCliente";

/** Devuelve el turno activo global (de cualquier usuario) con nombre y rol del operador.
 *  Retorna null si no hay ningún turno abierto. */
export async function obtenerTurnoActivo() {
  const { data, error } = await supabase.rpc("obtener_turno_activo");
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

function normalizarFilaCaja(row) {
  if (!row) return null;
  const abierto = row.abierto_en ?? row.creado_en ?? null;
  const montoApertura = row.monto_apertura ?? row.monto_inicial ?? 0;
  return {
    ...row,
    abierto_en: abierto,
    monto_apertura: Number(montoApertura),
  };
}

export async function obtenerCajaAbierta(usuarioId) {
  const { data, error } = await supabase
    .from("caja")
    .select("id, usuario_id, abierto_en, cerrado_en, creado_en, monto_apertura, monto_inicial, saldo_anterior")
    .eq("usuario_id", usuarioId)
    .is("cerrado_en", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normalizarFilaCaja(data);
}

/** Devuelve el saldo del último turno cerrado en TODA la tienda (contabilidad única).
 *  Usa una RPC SECURITY DEFINER para que cualquier rol (cajero, admin, superadmin)
 *  pueda obtener el saldo correcto sin importar quién cerró el turno anterior. */
export async function obtenerSaldoUltimoCierre() {
  const { data, error } = await supabase.rpc("obtener_saldo_ultimo_cierre_global");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function abrirCaja({ usuarioId, montoApertura = 0, motivoDiferenciaApertura = null }) {
  const monto = Number(montoApertura);
  if (Number.isNaN(monto) || monto < 0) {
    throw new Error("Monto de apertura invalido.");
  }

  // Verificar si ya existe un turno activo (propio o de otro usuario)
  const turnoGlobal = await obtenerTurnoActivo();
  if (turnoGlobal) {
    if (turnoGlobal.usuario_id === usuarioId) {
      throw new Error("Ya tienes un turno de caja abierto.");
    }
    throw new Error(
      `La caja ya está siendo operada por ${turnoGlobal.operador_nombre}. Debe cerrar su turno antes de que puedas abrir uno nuevo.`
    );
  }

  const saldoAnterior = await obtenerSaldoUltimoCierre();

  // Si la apertura difiere del saldo anterior (más o menos), el motivo es obligatorio
  if (saldoAnterior > 0 && monto !== saldoAnterior && !motivoDiferenciaApertura?.trim()) {
    const diff = monto - saldoAnterior;
    const etiqueta = diff > 0 ? "sobrante" : "faltante";
    throw new Error(`Debes explicar el motivo del ${etiqueta} al abrir el turno.`);
  }

  // La base del turno siempre es el saldo del turno anterior.
  // La diferencia con lo que el cajero trae físicamente se registra como primer movimiento,
  // evitando doble conteo en la fórmula: monto_apertura + ingresos - retiros = efectivo.
  const montoBase = saldoAnterior > 0 ? saldoAnterior : monto;

  const { data, error } = await supabase
    .from("caja")
    .insert({
      usuario_id: usuarioId,
      monto_inicial: montoBase,
      monto_apertura: montoBase,
      saldo_anterior: saldoAnterior,
      motivo_diferencia_apertura: (saldoAnterior > 0 && monto !== saldoAnterior) ? (motivoDiferenciaApertura?.trim() ?? null) : null,
    })
    .select("id, usuario_id, abierto_en, cerrado_en, creado_en, monto_apertura, monto_inicial, saldo_anterior")
    .single();

  if (error) throw new Error(error.message);

  const fila = normalizarFilaCaja(data);

  // Registrar la diferencia como primer movimiento del turno
  if (saldoAnterior > 0 && monto !== saldoAnterior) {
    const diferencia = Number(Math.abs(monto - saldoAnterior).toFixed(2));
    const esSobrante = monto > saldoAnterior;
    const etiqueta = esSobrante ? "Sobrante apertura" : "Faltante apertura";
    const concepto = motivoDiferenciaApertura?.trim()
      ? `${etiqueta} — ${motivoDiferenciaApertura.trim()}`
      : `${etiqueta}: $${Math.round(diferencia).toLocaleString("es-CO")} ${esSobrante ? "de más" : "de menos"} al abrir`;

    await supabase.from("movimientos_caja").insert({
      caja_id: fila.id,
      usuario_id: usuarioId,
      tipo: esSobrante ? "ingreso" : "retiro",
      monto: diferencia,
      concepto,
    });
  }

  // La diferencia queda en caja.saldo_anterior, caja.monto_apertura y
  // caja.motivo_diferencia_apertura — auditoría completa sin doble conteo.
  return fila;
}

export async function cerrarCaja({ cajaId, usuarioId, montoCierreEfectivo, notasCierre = "" }) {
  const { data: fila, error: errSel } = await supabase
    .from("caja")
    .select("id, cerrado_en")
    .eq("id", cajaId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (errSel) throw new Error(errSel.message);
  if (!fila) throw new Error("Turno de caja no encontrado.");
  if (fila.cerrado_en) throw new Error("Este turno ya esta cerrado.");

  // Saldo esperado según el sistema (antes de cualquier ajuste)
  const { data: resumenData } = await supabase.rpc("resumen_turno", { p_caja_id: cajaId });
  const saldoCalculado = resumenData?.[0]?.efectivo_en_caja != null
    ? Number(resumenData[0].efectivo_en_caja)
    : null;

  const montoCierre =
    montoCierreEfectivo === "" || montoCierreEfectivo === undefined || montoCierreEfectivo === null
      ? null
      : Number(montoCierreEfectivo);

  if (montoCierre !== null && (Number.isNaN(montoCierre) || montoCierre < 0)) {
    throw new Error("Monto de cierre invalido.");
  }

  // Si hay conteo físico y difiere del saldo del sistema, registrar el descuadre
  // como movimiento ANTES de cerrar (la RLS exige turno abierto para insertar movimientos).
  if (montoCierre !== null && saldoCalculado !== null) {
    const diferencia = montoCierre - saldoCalculado;
    const centavos = Math.round(Math.abs(diferencia) * 100);
    if (centavos > 0) {
      const esFaltante = diferencia < 0;
      const etiqueta = esFaltante ? "Faltante" : "Sobrante";
      const montoDesc = Math.abs(diferencia);
      const nota = notasCierre.trim()
        ? ` — ${notasCierre.trim()}`
        : "";
      const concepto = `Descuadre al cierre — ${etiqueta}: $${Math.round(montoDesc).toLocaleString("es-CO")}${nota}`;

      const { error: errMov } = await supabase
        .from("movimientos_caja")
        .insert({
          caja_id: cajaId,
          usuario_id: usuarioId,
          tipo: esFaltante ? "retiro" : "ingreso",
          monto: Number(montoDesc.toFixed(2)),
          concepto,
        });

      if (errMov) throw new Error(`Error al registrar descuadre: ${errMov.message}`);
    }
  }

  const { data, error } = await supabase
    .from("caja")
    .update({
      cerrado_en: new Date().toISOString(),
      monto_cierre_efectivo: montoCierre,
      saldo_calculado_cierre: saldoCalculado,   // se guarda el valor del sistema (auditoría)
      notas_cierre: notasCierre.trim() || null,
    })
    .eq("id", cajaId)
    .eq("usuario_id", usuarioId)
    .is("cerrado_en", null)
    .select("id, cerrado_en")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se pudo cerrar el turno (¿ya estaba cerrado?).");
  return data;
}

/** Resumen financiero del turno actual usando la función RPC de Supabase. */
export async function obtenerResumenTurno(cajaId) {
  const { data, error } = await supabase.rpc("resumen_turno", { p_caja_id: cajaId });
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    return { monto_apertura: 0, total_ingresos: 0, total_retiros: 0, efectivo_en_caja: 0, total_movimientos: 0 };
  }
  const r = data[0];
  return {
    monto_apertura: Number(r.monto_apertura ?? 0),
    total_ingresos: Number(r.total_ingresos ?? 0),
    total_retiros: Number(r.total_retiros ?? 0),
    efectivo_en_caja: Number(r.efectivo_en_caja ?? 0),
    total_movimientos: Number(r.total_movimientos ?? 0),
  };
}

/**
 * Calcula la ganancia neta del turno: ingresos por ventas (ya con descuentos aplicados)
 * menos el costo de los productos vendidos (cantidad × precio_compra actual del producto).
 *
 * NOTA: usa el precio_compra ACTUAL guardado en inventario, no un costo histórico —
 * el sistema no guarda el costo que tenía el producto en el momento exacto de la venta.
 * Si un producto no tiene precio_compra configurado, se asume costo $0 para ese ítem.
 */
export async function obtenerGananciaTurno(cajaId) {
  const { data, error } = await supabase
    .from("ventas")
    .select("total, detalle_venta(cantidad, productos(precio_compra))")
    .eq("caja_id", cajaId);

  if (error) throw new Error(error.message);

  let ingresoTotal = 0;
  let costoTotal = 0;
  for (const venta of data ?? []) {
    ingresoTotal += Number(venta.total ?? 0);
    for (const item of venta.detalle_venta ?? []) {
      const costo = Number(item.productos?.precio_compra ?? 0);
      costoTotal += costo * Number(item.cantidad ?? 0);
    }
  }

  return {
    ingresoTotal,
    costoTotal,
    ganancia: ingresoTotal - costoTotal,
  };
}

export async function listarMovimientosCaja(cajaId) {
  const { data, error } = await supabase
    .from("movimientos_caja")
    .select("id, tipo, monto, concepto, creado_en, usuario_id, usuarios(nombre)")
    .eq("caja_id", cajaId)
    .order("creado_en", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Carga en una sola consulta un resumen de productos para varios venta_ids.
 * Retorna un mapa: { [ventaId]: "Producto A x2, Producto B" }
 */
export async function obtenerResumenesVentas(ventaIds) {
  if (!ventaIds.length) return {};
  const { data } = await supabase
    .from("detalle_venta")
    .select("venta_id, cantidad, productos(nombre)")
    .in("venta_id", ventaIds);

  const mapa = {};
  for (const row of data ?? []) {
    if (!mapa[row.venta_id]) mapa[row.venta_id] = [];
    if (row.productos?.nombre) {
      mapa[row.venta_id].push(
        row.cantidad > 1 ? `${row.productos.nombre} x${row.cantidad}` : row.productos.nombre,
      );
    }
  }
  return mapa;
}

/** Busca movimientos en TODOS los turnos accesibles por el usuario (histórico global). */
export async function buscarMovimientosGlobales({ tipo = null, fechaDesde = null, fechaHasta = null, busqueda = null } = {}) {
  let query = supabase
    .from("movimientos_caja")
    .select("id, tipo, monto, concepto, creado_en, caja_id, usuarios(nombre), caja(abierto_en, cerrado_en)")
    .order("creado_en", { ascending: false })
    .limit(300);

  if (tipo) query = query.eq("tipo", tipo);
  if (fechaDesde) query = query.gte("creado_en", `${fechaDesde}T00:00:00`);
  if (fechaHasta) query = query.lte("creado_en", `${fechaHasta}T23:59:59`);
  if (busqueda?.trim()) query = query.ilike("concepto", `%${busqueda.trim()}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function obtenerDetalleVenta(ventaId) {
  const { data, error } = await supabase
    .from("ventas")
    .select(`
      id, total, subtotal, descuento, metodo_pago, creado_en,
      usuarios ( nombre ),
      detalle_venta ( cantidad, precio_unitario, productos ( nombre, codigo_barras ) )
    `)
    .eq("id", ventaId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function registrarMovimientoCaja({ cajaId, usuarioId, tipo, monto, concepto }) {
  if (tipo !== "ingreso" && tipo !== "retiro") {
    throw new Error("Tipo de movimiento invalido.");
  }

  const valor = Number(monto);
  if (Number.isNaN(valor) || valor <= 0) {
    throw new Error("Monto invalido.");
  }

  const { data, error } = await supabase
    .from("movimientos_caja")
    .insert({
      caja_id: cajaId,
      usuario_id: usuarioId,
      tipo,
      monto: valor,
      concepto: (concepto ?? "").trim() || "(sin concepto)",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
