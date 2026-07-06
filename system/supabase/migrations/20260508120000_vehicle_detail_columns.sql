-- Optional structured fields from VIN decode (NHTSA vPIC); vehicle_name remains primary display line.
alter table public.vehicles
  add column if not exists model_year text not null default '',
  add column if not exists vehicle_make text not null default '',
  add column if not exists vehicle_model text not null default '',
  add column if not exists trim_level text not null default '',
  add column if not exists body_class text not null default '';

comment on column public.vehicles.model_year is 'Model year from VIN decode or manual entry';
comment on column public.vehicles.vehicle_make is 'Make from VIN decode or manual entry';
comment on column public.vehicles.vehicle_model is 'Model from VIN decode or manual entry';
comment on column public.vehicles.trim_level is 'Trim from VIN decode or manual entry';
comment on column public.vehicles.body_class is 'Body class from VIN decode or manual entry';
