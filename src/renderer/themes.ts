import type { ITheme } from "@xterm/xterm";

/** A colour scheme for the terminal: background, text and the 16 ANSI colours. */
export interface TerminalTheme {
  name: string;
  background: string;
  foreground: string;
  /** 8 normal colours, then 8 bright ones: black, red, green, yellow, blue, magenta, cyan, white. */
  ansi: string[];
}

export const THEMES: TerminalTheme[] = [
  {
    name: "Tokyo Night",
    background: "#1a1b26",
    foreground: "#c0caf5",
    ansi: [
      "#15161e",
      "#f7768e",
      "#9ece6a",
      "#e0af68",
      "#7aa2f7",
      "#bb9af7",
      "#7dcfff",
      "#a9b1d6",
      "#414868",
      "#f7768e",
      "#9ece6a",
      "#e0af68",
      "#7aa2f7",
      "#bb9af7",
      "#7dcfff",
      "#c0caf5",
    ],
  },
  {
    name: "Dracula",
    background: "#282a36",
    foreground: "#f8f8f2",
    ansi: [
      "#21222c",
      "#ff5555",
      "#50fa7b",
      "#f1fa8c",
      "#bd93f9",
      "#ff79c6",
      "#8be9fd",
      "#f8f8f2",
      "#6272a4",
      "#ff6e6e",
      "#69ff94",
      "#ffffa5",
      "#d6acff",
      "#ff92df",
      "#a4ffff",
      "#ffffff",
    ],
  },
  {
    name: "Nord",
    background: "#2e3440",
    foreground: "#d8dee9",
    ansi: [
      "#3b4252",
      "#bf616a",
      "#a3be8c",
      "#ebcb8b",
      "#81a1c1",
      "#b48ead",
      "#88c0d0",
      "#e5e9f0",
      "#4c566a",
      "#bf616a",
      "#a3be8c",
      "#ebcb8b",
      "#81a1c1",
      "#b48ead",
      "#8fbcbb",
      "#eceff4",
    ],
  },
  {
    name: "Gruvbox Dark",
    background: "#282828",
    foreground: "#ebdbb2",
    ansi: [
      "#282828",
      "#cc241d",
      "#98971a",
      "#d79921",
      "#458588",
      "#b16286",
      "#689d6a",
      "#a89984",
      "#928374",
      "#fb4934",
      "#b8bb26",
      "#fabd2f",
      "#83a598",
      "#d3869b",
      "#8ec07c",
      "#ebdbb2",
    ],
  },
  {
    name: "Solarized Dark",
    background: "#002b36",
    foreground: "#93a1a1",
    ansi: [
      "#073642",
      "#dc322f",
      "#859900",
      "#b58900",
      "#268bd2",
      "#d33682",
      "#2aa198",
      "#eee8d5",
      "#586e75",
      "#cb4b16",
      "#859900",
      "#b58900",
      "#268bd2",
      "#6c71c4",
      "#2aa198",
      "#fdf6e3",
    ],
  },
  {
    name: "Paper (light)",
    background: "#fbf7ef",
    foreground: "#3b3b3b",
    ansi: [
      "#3b3b3b",
      "#c0392b",
      "#2e8b57",
      "#b7791f",
      "#2b6cb0",
      "#8e44ad",
      "#1a8a8a",
      "#d9d3c7",
      "#7f7f7f",
      "#e74c3c",
      "#3cb371",
      "#d69e2e",
      "#3182ce",
      "#9b59b6",
      "#20a4a4",
      "#ffffff",
    ],
  },
];

export function themeNamed(name: string | null | undefined): TerminalTheme {
  return (
    THEMES.find((theme) => theme.name === name) ?? (THEMES[0] as TerminalTheme)
  );
}

export function toXtermTheme(theme: TerminalTheme): ITheme {
  const [
    black,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,
    brightBlack,
    brightRed,
    brightGreen,
    brightYellow,
    brightBlue,
    brightMagenta,
    brightCyan,
    brightWhite,
  ] = theme.ansi;
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.foreground,
    selectionBackground: `${theme.foreground}40`,
    black,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,
    brightBlack,
    brightRed,
    brightGreen,
    brightYellow,
    brightBlue,
    brightMagenta,
    brightCyan,
    brightWhite,
  };
}

/** Colour tags the user puts on sessions to tell them apart. */
export const TAGS = [
  { id: "red", title: "Red", color: "#eb4d4d" },
  { id: "orange", title: "Orange", color: "#f79433" },
  { id: "yellow", title: "Yellow", color: "#f2cc40" },
  { id: "green", title: "Green", color: "#4dbf66" },
  { id: "teal", title: "Teal", color: "#40b8b8" },
  { id: "blue", title: "Blue", color: "#4d8cf2" },
  { id: "purple", title: "Purple", color: "#9e66e6" },
  { id: "pink", title: "Pink", color: "#ed6eb3" },
] as const;

export function tagColor(id: string | undefined): string | undefined {
  return TAGS.find((tag) => tag.id === id)?.color;
}
