/**
 * Cart-level percentage discount (ciclo 6).
 * Applied after per-line euro discounts; distributed proportionally into
 * discount_cents so create_sale / VAT path stay line-based.
 */

export type CartDiscountLineIn = {
  unitPriceCents: number;
  qty: number;
  /** Manual line discount in cents (tax-inclusive). */
  lineDiscountCents?: number;
};

export type CartDiscountLineOut = {
  /** Total discount_cents to send to create_sale (line + cart share). */
  discountCents: number;
  /** Gross before any discount */
  grossCents: number;
  /** After line-only discount */
  afterLineCents: number;
  /** Cart % share allocated to this line */
  cartShareCents: number;
  /** Final line total (PVP incl. VAT) */
  lineTotalCents: number;
};

export type CartDiscountPlan = {
  percent: number;
  lines: CartDiscountLineOut[];
  cartDiscountTotalCents: number;
  totalCents: number;
};

/** Clamp percent to [0, 100]. Non-finite → 0. */
export function clampCartPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

/**
 * Build final per-line discounts including cart percentage.
 * Rounding: floor shares, remainder on last line with afterLine > 0 (or last line).
 */
export function planCartDiscounts(
  lines: CartDiscountLineIn[],
  cartPercent: number,
): CartDiscountPlan {
  const percent = clampCartPercent(cartPercent);
  if (!lines.length) {
    return { percent, lines: [], cartDiscountTotalCents: 0, totalCents: 0 };
  }

  const prepared = lines.map((l) => {
    const qty = Math.max(0, Math.floor(l.qty));
    const unit = Math.max(0, Math.floor(l.unitPriceCents));
    const gross = unit * qty;
    const lineD = Math.min(Math.max(0, Math.floor(l.lineDiscountCents ?? 0)), gross);
    return { gross, lineD, afterLine: gross - lineD };
  });

  const sumAfter = prepared.reduce((a, x) => a + x.afterLine, 0);
  const targetCart = Math.round((sumAfter * percent) / 100);

  let allocated = 0;
  const lastIdx = prepared.length - 1;
  // Prefer remainder on last line that still has afterLine room
  let remainderIdx = lastIdx;
  for (let i = lastIdx; i >= 0; i--) {
    if (prepared[i].afterLine > 0) {
      remainderIdx = i;
      break;
    }
  }

  const out: CartDiscountLineOut[] = prepared.map((x, i) => {
    let cartShare = 0;
    if (targetCart > 0 && sumAfter > 0) {
      if (i === remainderIdx) {
        cartShare = Math.min(x.afterLine, targetCart - allocated);
      } else {
        cartShare = Math.min(
          x.afterLine,
          Math.floor((x.afterLine / sumAfter) * targetCart),
        );
        allocated += cartShare;
      }
    }
    const discountCents = x.lineD + cartShare;
    return {
      discountCents,
      grossCents: x.gross,
      afterLineCents: x.afterLine,
      cartShareCents: cartShare,
      lineTotalCents: x.gross - discountCents,
    };
  });

  // Fix allocated for remainder line
  if (targetCart > 0 && sumAfter > 0) {
    const sumShares = out.reduce((a, l) => a + l.cartShareCents, 0);
    // already set remainder to target - allocated where allocated was pre-remainder
    // recompute remainder from total to be safe
    let nonRem = 0;
    out.forEach((l, i) => {
      if (i !== remainderIdx) nonRem += l.cartShareCents;
    });
    const remShare = Math.min(prepared[remainderIdx].afterLine, targetCart - nonRem);
    const p = prepared[remainderIdx];
    out[remainderIdx] = {
      discountCents: p.lineD + remShare,
      grossCents: p.gross,
      afterLineCents: p.afterLine,
      cartShareCents: remShare,
      lineTotalCents: p.gross - (p.lineD + remShare),
    };
  }

  const cartDiscountTotalCents = out.reduce((a, l) => a + l.cartShareCents, 0);
  const totalCents = out.reduce((a, l) => a + l.lineTotalCents, 0);

  return { percent, lines: out, cartDiscountTotalCents, totalCents };
}
