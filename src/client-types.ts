export interface ElementHandle {
  _type: 'element';
  id: string;
  elementType: string;
  data?: Record<string, unknown>;
}

export type LogType = 'info' | 'error' | 'debug' | 'normal';

export type AppendLog = (message: string, type?: LogType) => void;

export type SendMessage = (msg: object) => void;

export type DiscriminatedMap<Discriminant extends string, Map extends Record<string, object>> = {
  [K in keyof Map & string]: {
    [P in Discriminant]: K;
  } & Map[K];
}[keyof Map & string];

export type HandlerMap<Discriminant extends string, Map extends Record<string, object>, ReturnValue = void> = {
  [K in keyof Map & string]: (message: {
    [P in Discriminant]: K;
  } & Map[K]) => ReturnValue;
};
