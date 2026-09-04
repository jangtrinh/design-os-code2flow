import { iconHtml } from "./icons.js";
const CHEVRON = iconHtml("caret-down");
let dropdownId = 0;

export interface DropdownOption { id: string; label: string }

/** Accessible pill button and listbox for compact toolbar choices. */
export function createDropdown(label: string, options: DropdownOption[], selected: string, choose: (id: string) => void): HTMLElement {
  const wrapper = document.createElement("span"); wrapper.className = "crumb-dropdown";
  const menuId = `crumb-menu-${++dropdownId}`;
  const button = document.createElement("button"); button.className = "crumb-picker"; button.type = "button";
  button.setAttribute("aria-label", label); button.setAttribute("aria-haspopup", "listbox"); button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", menuId);
  const current = options.find((option) => option.id === selected) ?? options[0];
  button.innerHTML = `<span>${current.label}</span>${CHEVRON}`;
  const menu = document.createElement("div"); menu.className = "crumb-menu"; menu.id = menuId; menu.hidden = true; menu.setAttribute("role", "listbox"); menu.setAttribute("aria-label", label);
  const rows = options.map((option) => {
    const row = document.createElement("button"); row.type = "button"; row.className = "crumb-option"; row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(option.id === selected)); row.dataset.id = option.id;
    row.innerHTML = `<span class="crumb-check" aria-hidden="true">${option.id === selected ? iconHtml("check") : ""}</span><span>${option.label}</span>`;
    row.addEventListener("click", () => { close(); choose(option.id); }); menu.append(row); return row;
  });
  let open = false;
  const close = (): void => { if (!open) return; open = false; menu.hidden = true; button.setAttribute("aria-expanded", "false"); };
  const show = (): void => { open = true; menu.hidden = false; button.setAttribute("aria-expanded", "true"); (rows.find((row) => row.dataset.id === selected) ?? rows[0])?.focus(); };
  button.addEventListener("click", () => open ? close() : show());
  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { close(); button.focus(); return; }
    if (!open || (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter")) return;
    const currentRow = document.activeElement as HTMLElement; const index = Math.max(0, rows.indexOf(currentRow as HTMLButtonElement));
    if (event.key === "Enter") { currentRow.click(); return; }
    rows[(index + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length]?.focus(); event.preventDefault();
  });
  document.addEventListener("pointerdown", (event) => { if (!wrapper.contains(event.target as Node)) close(); });
  wrapper.append(button, menu); return wrapper;
}
