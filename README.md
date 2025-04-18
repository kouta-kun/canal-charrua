# Canal Charrúa

[Canal Charrúa](https://koutarou.uy/betumhue/) es un tablón anónimo,
código abierto, creado especificamente para uruguay.

## Development
Para correr el backend:

```bash
$ python3 -m venv venv
$ venv/bin/pip install -r requirements
$ venv/bin/python3 -m uvicorn main:app
```

Para correr el frontend:

```bash
$ cd frontend
$ npm install
$ npm run dev
```

## Licencia
El proyecto utiliza la licencia Affero GPLv3.

### GeoAcumen
Utilizamos la fuente de datos [GeoAcumen](https://github.com/geoacumen/geoacumen-country) para identificar
la fuente de los posts. La misma es Apache v2, compatible con AGPLv3.

## Colaborar
Forkealo, armá un PR, y vemos.
