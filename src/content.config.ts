import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const documento = z.object({ texto: z.string().nullable().optional(), url: z.string(), formato: z.string().nullable().optional() });

const paginas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/paginas' }),
  schema: z.object({
    titulo: z.string(),
    url: z.string(),
    nodo: z.string(),
    seccion: z.string(),
    plantilla: z.string().default('pagina'),
    antetitulo: z.string().optional(),
    entradilla: z.string().optional(),
    descripcion: z.string(),
    ruta_antigua: z.string().optional(),
    ultima_actualizacion: z.coerce.date().optional(),
    titulo_original: z.string().optional(),
    origen_contenido: z.string().optional(),
    contenido_oculto_en_origen: z.number().optional(),
    ambito: z.string().optional(),
    norma: z.object({
      ambito: z.string().nullable(), titulo: z.string().nullable(), titulo_en_listado: z.string().nullable(), descripcion: z.string().nullable(),
      codigo: z.string().nullable(), categoria: z.string().nullable(), ambito_ficha: z.string().nullable(), creada: z.string().nullable(),
      estado: z.string().nullable(), numero: z.string().nullable(), fecha: z.coerce.date().nullable(),
      enlaces_oficiales: z.array(z.object({ url: z.string(), texto: z.string().nullable() })),
    }).optional(),
  }),
});

const noticias = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/noticias' }),
  schema: z.object({
    titulo: z.string(),
    fecha: z.coerce.date().optional(),
    sin_fecha_en_origen: z.boolean().optional(),
    orden_origen: z.number().optional(),
    imagen: z.string().optional(),
    imagen_alt: z.string().default(''),
    fuente: z.object({ texto: z.string(), url: z.string() }).optional(),
    adjuntos: z.array(documento).default([]),
    destacada: z.boolean().default(false),
  }),
});

const anuncios = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/anuncios' }),
  schema: z.object({
    titulo: z.string(),
    expediente: z.string().nullable().optional(),
    fecha: z.coerce.date().nullable().optional(),
    orden_origen: z.number().optional(),
    destacado: z.boolean().default(false),
    adjuntos: z.array(documento).default([]),
  }),
});

const avisos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/avisos' }),
  schema: z.object({
    titulo: z.string(),
    subtitulo: z.string().nullable().optional(),
    fecha: z.coerce.date().nullable().optional(),
    nivel: z.enum(['alerta', 'aviso', 'informacion']).default('aviso'),
    activo: z.boolean().default(false),
    enlace: z.string().nullable().optional(),
    nota_migracion: z.string().optional(),
  }),
});

export const collections = { paginas, noticias, anuncios, avisos };
