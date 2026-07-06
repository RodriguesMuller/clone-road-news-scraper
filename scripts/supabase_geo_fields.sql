alter table news add column if not exists latitude double precision;
alter table news add column if not exists longitude double precision;
alter table news add column if not exists geo_precision text;
alter table news add column if not exists highway text;
alter table news add column if not exists state text;
alter table news add column if not exists city text;

create index if not exists news_geo_lat_lng_idx
  on news (latitude, longitude)
  where latitude is not null and longitude is not null;

create index if not exists news_state_city_idx
  on news (state, city);
