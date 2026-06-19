// Builds Unlayer (react-email-editor) design rows for Shopify products, so they
// can be appended into the current email design in the builder.

export interface ShopProduct {
  id?: number | string;
  title: string;
  image?: string | null;
  price?: number;
  currency?: string | null;
  url?: string;
}

let _c = 1;
const uid = () => `sp${Date.now().toString(36)}${(_c++).toString(36)}`;

function img(url: string, alt: string) {
  return {
    id: uid(), type: "image",
    values: {
      containerPadding: "0px", anchor: "",
      src: { url, width: 600, height: 400, autoWidth: false, maxWidth: "60%" },
      textAlign: "center", altText: alt,
      action: { name: "web", values: { href: "#", target: "_blank" } },
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_image" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

function txt(html: string) {
  return {
    id: uid(), type: "text",
    values: {
      containerPadding: "8px 32px 0px", textAlign: "center",
      fontSize: "15px", lineHeight: "150%",
      linkStyle: { inherit: true, linkColor: "#FF6B35", linkHoverColor: "#FF6B35", linkUnderline: true, linkHoverUnderline: true },
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_text" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
      text: html,
    },
  };
}

function btn(label: string, href: string) {
  return {
    id: uid(), type: "button",
    values: {
      containerPadding: "8px 32px 24px", anchor: "",
      href: { name: "web", values: { href: href || "#", target: "_blank" } },
      buttonColors: { color: "#FFFFFF", backgroundColor: "#FF6B35", hoverColor: "#FFFFFF", hoverBackgroundColor: "#FF6B35" },
      size: { autoWidth: true }, fontWeight: 700, fontSize: "14px",
      textAlign: "center", lineHeight: "120%", padding: "12px 26px",
      border: {}, borderRadius: "8px",
      hideDesktop: false, displayCondition: null,
      _meta: { htmlClassNames: "u_content_button" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
      text: `<span style="word-break:break-word">${label}</span>`,
      calculatedWidth: 160, calculatedHeight: 40,
    },
  };
}

function row(contents: object[]) {
  return {
    id: uid(), cells: [1],
    columns: [{ id: uid(), contents, values: { backgroundColor: "", padding: "0px", border: {}, _meta: { htmlClassNames: "u_column" } } }],
    values: {
      displayCondition: null, columns: false, backgroundColor: "#FFFFFF", columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
      padding: "12px 0px", anchor: "", hideDesktop: false, _meta: { htmlClassNames: "u_row" },
    },
  };
}

/** One Unlayer row per product: image + title/price + "Comprar" button. */
export function buildProductRows(products: ShopProduct[]): object[] {
  return products.map((p) => {
    const cur = p.currency || "";
    const price = p.price != null ? `${Number(p.price).toFixed(2)} ${cur}`.trim() : "";
    const contents: object[] = [];
    if (p.image) contents.push(img(p.image, p.title));
    contents.push(txt(`<strong style="font-size:16px">${p.title}</strong>${price ? `<br/><span style="color:#64748b">${price}</span>` : ""}`));
    contents.push(btn("Comprar →", p.url || "#"));
    return row(contents);
  });
}
