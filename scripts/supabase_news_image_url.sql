-- Imagem publicada pela própria fonte no feed (media:content, thumbnail, enclosure
-- ou <img> do resumo). Usada nos cartões do Dashboard, com crédito à fonte.
-- Idempotente: pode rodar mais de uma vez.
ALTER TABLE public.news ADD COLUMN IF NOT EXISTS image_url text;
