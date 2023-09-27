// mdns-js.d.ts
declare module 'mdns-js' {
  export interface ServiceType {
    name: string;
    protocol: string;
  }

  export function createAdvertisement(serviceType: ServiceType, port: number, options?: object): Advertisment;
  export function createBrowser(): Browser;


  export interface Browser {
    on(event: string, callback: (data: any) => void): void;
  }

  export function tcp(protocol: string): ServiceType
  export function udp(protocol: string): ServiceType

  export interface Advertisment {
    start(): void;
    stop(): void;
    port: number;
    serviceType: ServiceType;
    options: { name: string } & Record<string,any>;
    nameSuffix: string;
    alias: string;
    status: number;
  }
}
