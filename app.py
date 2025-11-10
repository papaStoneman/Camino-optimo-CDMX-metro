from flask import Flask, request, render_template_string
import networkx as nx

app = Flask(__name__)

# --- LÍNEAS (usaré exactamente lo que pegaste) ---
lines = {
    "L1": { "color": "#8B1B3B", "stations": ["Observatorio", "Tacubaya", "Juanacatlan", "Chapultecpec", "Sevilla", "Insurgentes", "Cuauhtemoc", "Balderas"] },
    "L3": { "color": "#92C54A", "stations": ["Universidad", "Copilco", "M. A. De Quevedo", "Viveros", "Coyoacan", "Zapata", "Division del Norte", "Eugenia", "Etiopia", "Centro Medico", "Hospital General", "Niños Heroes", "Balderas", "Juarez"] },
    "L7": { "color": "#F08A24", "stations": ["Barranca del Muerto", "Mixcoac", "San Antonio", "San Pedro de los Pinos", "Tacubaya", "Constituyentes", "Auditorio", "Polanco"] },
    "L9": { "color": "#7C4A1A", "stations": ["Tacubaya", "Patriotismo", "Chilpancingo", "Centro Medico", "Lazaro Cardenas"] },
    "L12":{ "color": "#2F7A3F", "stations": ["Mixcoac", "Insurgentes Sur", "Hospital 20 de Noviembre", "Zapata", "Parque de los Venados", "Eje Central"] }
}

# Parámetros de tiempo (minutos)
TIME_BETWEEN_STATIONS = 2   # tiempo entre estaciones consecutivas en la misma línea (minutos)
TIME_TRANSFER = 5           # tiempo por realizar un transbordo (minutos)

# --- Construcción del grafo multilayer ---
# Usaremos nodos del tipo (station, line)
G = nx.Graph()

# Añadimos nodos y aristas entre estaciones consecutivas en la misma línea
for line_name, info in lines.items():
    seq = info["stations"]
    for i, station in enumerate(seq):
        node = (station, line_name)
        G.add_node(node, station=station, line=line_name)
        if i > 0:
            prev = (seq[i-1], line_name)
            # arista entre prev y node con peso TIME_BETWEEN_STATIONS
            G.add_edge(prev, node, weight=TIME_BETWEEN_STATIONS, type="rail", line=line_name)

# Añadimos aristas de transbordo (entre nodos con mismo station pero distintas líneas)
# Recorrer todas las combinaciones de nodos que comparten la misma estación
from collections import defaultdict
station_to_nodes = defaultdict(list)
for node in G.nodes:
    station = node[0]
    station_to_nodes[station].append(node)

for station, node_list in station_to_nodes.items():
    # si más de una réplica significa que hay transbordo
    for i in range(len(node_list)):
        for j in range(i+1, len(node_list)):
            n1 = node_list[i]
            n2 = node_list[j]
            # añadimos arista de transbordo con peso TIME_TRANSFER
            G.add_edge(n1, n2, weight=TIME_TRANSFER, type="transfer")

# --- función para encontrar el camino óptimo en minutos ---
def find_best_path(origin_station, dest_station):
    # Creamos copias temporales para añadir SOURCE y TARGET
    Gtmp = G.copy()
    SOURCE = ("__SOURCE__", "__SRC__")
    TARGET = ("__TARGET__", "__TGT__")
    Gtmp.add_node(SOURCE)
    Gtmp.add_node(TARGET)

    # Conectar SOURCE a todas las réplicas del origin_station con peso 0
    origin_nodes = station_to_nodes.get(origin_station, [])
    dest_nodes = station_to_nodes.get(dest_station, [])

    if not origin_nodes or not dest_nodes:
        return None, None  # estación desconocida

    for on in origin_nodes:
        Gtmp.add_edge(SOURCE, on, weight=0)
    for dn in dest_nodes:
        Gtmp.add_edge(dn, TARGET, weight=0)

    # heurística cero (admisible) -> A* = Dijkstra
    def heuristic(u, v):
        return 0

    try:
        path_nodes = nx.astar_path(Gtmp, SOURCE, TARGET, heuristic=heuristic, weight='weight')
        # calcular coste total
        total = 0
        for a, b in zip(path_nodes[:-1], path_nodes[1:]):
            total += Gtmp[a][b]['weight']
        # Convertir path de nodos (incluye SOURCE/TARGET) a lista de (station,line)
        # y además lo convertimos a una representación legible por el usuario: lista de dicts
        readable = []
        for node in path_nodes:
            if node == SOURCE or node == TARGET:
                continue
            station, line = node
            readable.append({"station": station, "line": line})
        return readable, total
    except nx.NetworkXNoPath:
        return None, None

# --- Plantilla simple ---
INDEX_HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Metro CDMX - A* (networkx, tiempos)</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background:#f4f6fb; color:#222; }
    .card { background:white; padding:16px; border-radius:8px; box-shadow:0 6px 18px rgba(20,20,50,0.06);}
    form { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    select, button { padding:8px 10px; border-radius:6px; border:1px solid #ddd; }
    button { background:#2563eb;color:white;border:none; cursor:pointer; }
    .route { margin-top:12px; }
    .step { padding:6px 8px; background:#f8fafc; border-radius:6px; margin:6px 0; border:1px solid #eee; }
    .meta { margin-top:8px; color:#555; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Metro CDMX — búsqueda A* (por tiempo)</h2>
    <p>Tiempo entre estaciones: <strong>{{t_station}} min</strong>. Tiempo por transbordo: <strong>{{t_transfer}} min</strong>.</p>

    <form method="POST">
      <label>Origen:
        <select name="origin">
          {% for s in stations %}
            <option value="{{s}}" {% if s==origin %}selected{% endif %}>{{s}}</option>
          {% endfor %}
        </select>
      </label>

      <label>Destino:
        <select name="destination">
          {% for s in stations %}
            <option value="{{s}}" {% if s==destination %}selected{% endif %}>{{s}}</option>
          {% endfor %}
        </select>
      </label>

      <button type="submit">Calcular</button>
    </form>

    {% if route %}
      <div class="route">
        <h3>Ruta encontrada ({{ total }} minutos)</h3>
        {% for step in route %}
          <div class="step">
            <strong>{{ loop.index }}.</strong>
            {{ step.station }} — <em>{{ step.line }}</em>
          </div>
        {% endfor %}
        <div class="meta">Número total de pasos mostrados: {{ route|length }} (cada paso es estación+línea).</div>
      </div>
    {% elif origin and destination %}
      <p style="color:#b91c1c">No se encontró ruta entre {{origin}} y {{destination}}.</p>
    {% endif %}

    <hr>
    <div>
      <strong>Líneas incluidas:</strong>
      <ul>
      {% for lname, info in lines.items() %}
        <li>{{lname}} — estaciones: {{ info.stations|length }}</li>
      {% endfor %}
      </ul>
    </div>
  </div>
</body>
</html>
"""

# --- Rutas Flask ---
@app.route("/", methods=["GET", "POST"])
def index():
    origin = None
    destination = None
    route = None
    total = None
    if request.method == "POST":
        origin = request.form.get("origin")
        destination = request.form.get("destination")
        if origin and destination:
            route, total = find_best_path(origin, destination)
    stations_list = sorted(station_to_nodes.keys())
    return render_template_string(INDEX_HTML,
                                  stations=stations_list,
                                  origin=origin,
                                  destination=destination,
                                  route=route,
                                  total=total,
                                  t_station=TIME_BETWEEN_STATIONS,
                                  t_transfer=TIME_TRANSFER,
                                  lines=lines)

if __name__ == "__main__":
    print("Iniciando servidor en http://127.0.0.1:5000/")
    app.run(debug=True)
