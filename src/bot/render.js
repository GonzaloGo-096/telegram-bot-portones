import { CALLBACKS } from "./utils.js";

const NAV_BACK = "🔙 Volver";

function oneColumnButtons(items, toButton) {
  return items.map((item) => [toButton(item)]);
}

export function menuPrincipalText() {
  return "Bienvenido a GGO Automatizaciones 👋\nElige un módulo para continuar:";
}

export function buildMenuPrincipalKeyboard(modules) {
  const buttons = [];
  if (modules.includes("portones")) {
    buttons.push([{ text: "🚪 Portones", callback_data: CALLBACKS.MODULE_PORTONES }]);
  }
  if (modules.includes("cultivos")) {
    buttons.push([{ text: "🌱 Cultivos", callback_data: CALLBACKS.MODULE_CULTIVOS }]);
  }
  return { inline_keyboard: buttons };
}

export function gruposText() {
  return "Seleccioná un grupo de portones:";
}

export function buildGruposKeyboard(groups) {
  const rows = oneColumnButtons(groups, (group) => ({
    text: `📂 ${group?.nombre || group?.name || `Grupo ${group?.id}`}`,
    callback_data: `${CALLBACKS.GROUP_PREFIX}${group?.id}`,
  }));
  rows.push([{ text: NAV_BACK, callback_data: CALLBACKS.BACK_TO_MENU }]);
  return { inline_keyboard: rows };
}

export function portonesText() {
  return "Seleccioná un portón para abrir:";
}

export function buildPortonesKeyboard(gates) {
  const rows = oneColumnButtons(gates, (gate) => ({
    text: `🚪 ${gate?.nombre || gate?.name || `Portón ${gate?.id}`}`,
    callback_data: `${CALLBACKS.GATE_PREFIX}${gate?.id}`,
  }));
  rows.push([{ text: NAV_BACK, callback_data: CALLBACKS.BACK_TO_GROUPS }]);
  return { inline_keyboard: rows };
}

export function cultivosText() {
  return "Cultivos disponibles:";
}

export function buildCultivosKeyboard(cultivos) {
  const rows = oneColumnButtons(cultivos, (cultivo) => ({
    text: `🌱 ${cultivo?.nombre || cultivo?.name || `Cultivo ${cultivo?.id}`}`,
    callback_data: "noop:cultivo",
  }));
  rows.push([{ text: NAV_BACK, callback_data: CALLBACKS.BACK_TO_MENU }]);
  return { inline_keyboard: rows };
}
