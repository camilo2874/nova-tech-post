/**
 * Convierte texto a caracteres ASCII seguros para impresoras térmicas
 * (p. ej. Epson TM-T20II vía driver/navegador), donde UTF-8 suele
 * imprimirse mal (tildes, ñ, signo ×, etc.).
 */
export function asciiImpresion(valor) {
  if (valor == null) return "";
  let s = String(valor);

  s = s.replace(/\u00d7/g, " x "); // × entre cantidad y precio
  s = s.replace(/\u2014|\u2013/g, "-");
  s = s.replace(/[\u201c\u201d\u201e\u201f]/g, '"');
  s = s.replace(/\u00a0|\u202f/g, " ");

  try {
    s = s.normalize("NFD").replace(/\p{M}/gu, "");
  } catch {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  s = s.replace(/\u00f1/g, "n").replace(/\u00d1/g, "N");
  s = s.replace(/[\u00a1\u00bf]/g, (c) => (c === "\u00a1" ? "!" : "?"));

  return s.trim();
}

/**
 * Solo caracteres ASCII visibles (espacio–~), sin acentos ni simbolos raros.
 * Ideal para drivers de termica que tratan mal UTF-8.
 */
export function asciiImpresionEstricto(valor) {
  return asciiImpresion(valor).replace(/[^\x20-\x7e]/g, "");
}

/** Fecha/hora solo ASCII (evita "p. m." con caracteres raros). */
export function fechaHoraTicket(valor) {
  if (valor == null || valor === "") return "-";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return asciiImpresion(String(valor));
  const dia = d.getDate();
  const mes = d.getMonth() + 1;
  const anio = d.getFullYear();
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const suf = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const anioCorto = String(anio).slice(-2);
  return `${dia}/${mes}/${anioCorto} ${h}:${min} ${suf}`;
}
