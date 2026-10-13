export const PLATAFORMAS = ['macos', 'windows'] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];
