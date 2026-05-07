/**
 * Textos de cabecera y pie del ticket de factura.
 * Edita estos valores o pasa la prop `tienda` a `<Factura />` para sobrescribir solo algunos campos.
 */
export const TIENDA_FACTURA_DEFAULT = {
  /** Línea bajo el nombre comercial (calle, barrio, ciudad). */
  direccion: "Cra 1 # 17-11, La Unión, Nariño",
  /** Celular de contacto de la tienda. */
  telefono: "3225894320",
  /** Mensaje promocional o de agradecimiento (puede usar \\n para varias líneas). */
  mensajePie: "Gracias por su compra!\nVuelva pronto.",
};
