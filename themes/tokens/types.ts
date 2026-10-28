/**
 * Design token types for LiAI.
 */
import { TextStyle } from "react-native";

export interface TypographyStyle {
  size: number;
  lineHeight: number;
  weight: TextStyle["fontWeight"];
}

export interface TypeScale {
  h1: TypographyStyle;
  h2: TypographyStyle;
  h3: TypographyStyle;
  h4: TypographyStyle;
  bodyLg: TypographyStyle;
  bodyMd: TypographyStyle;
  bodySm: TypographyStyle;
  caption: TypographyStyle;
  title: TypographyStyle;
  xs: TypographyStyle;
  micro: TypographyStyle;
}

export interface TokenRadius {
  micro: number;
  small: number;
  default: number;
  large: number;
  xLarge: number;
  full: number;
  card: number;
}

export interface TokenSpacing {
  none: number;
  xxs: number;
  xs: number;
  s: number;
  sm: number;
  m: number;
  ml: number;
  l: number;
  xl: number;
  xxl: number;
}

export interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface TokenShadow {
  card: ShadowStyle;
  sheet: ShadowStyle;
  subtle: ShadowStyle;
  bubble: ShadowStyle;
}
