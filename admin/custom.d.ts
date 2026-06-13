declare module '@strapi/design-system/*';
declare module '@strapi/design-system';

interface Window {
  strapi?: {
    backendURL?: string;
  };
}
