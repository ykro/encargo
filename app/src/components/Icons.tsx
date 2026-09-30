// Small inline icons (stroke = currentColor) so states never rely on color alone.
type P = { size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const Check = ({ size = 20 }: P) => (<svg {...base(size)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const Cross = ({ size = 20 }: P) => (<svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Dash = ({ size = 20 }: P) => (<svg {...base(size)}><path d="M6 12h12" /></svg>);
export const Key = ({ size = 20 }: P) => (<svg {...base(size)}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></svg>);
export const Arrow = ({ size = 20 }: P) => (<svg {...base(size)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
