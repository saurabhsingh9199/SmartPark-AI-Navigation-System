from flask import Flask, jsonify, render_template, request
import heapq
import time

app = Flask(__name__)


FLOORS = 3
ROWS = 6
COLS = 8

EMPTY    = 0
OCCUPIED = 1
ENTRY    = 2


def is_entry(cell_value):
    return cell_value == ENTRY
def is_occupied(cell_value):
    return cell_value == OCCUPIED
def is_available(cell_value):    
    return not is_occupied(cell_value) and not is_entry(cell_value)
def build_default_layout():
    
    layout = []
    for f in range(FLOORS):
        floor = [[EMPTY] * COLS for _ in range(ROWS)]

        # Entry gates (top-left corner of each floor)
        floor[0][0] = ENTRY

        # Pre-occupy some spots to make navigation interesting
        preset = {
            0: [(0,2),(0,4),(1,1),(1,5),(2,3),(3,2),(3,6),(4,0),(4,4),(5,1)],
            1: [(0,3),(1,2),(1,6),(2,0),(2,5),(3,1),(3,4),(4,2),(4,7),(5,3)],
            2: [(0,1),(0,5),(1,3),(2,2),(2,6),(3,0),(3,5),(4,1),(4,6),(5,4)],
        }
        for (r, c) in preset.get(f, []):
            floor[r][c] = OCCUPIED

        layout.append(floor)
    return layout
parking_state = build_default_layout()

def dijkstra(layout, floor_idx):
    grid = layout[floor_idx]
    start = None

    # Locate entry gate
    for r in range(ROWS):
        for c in range(COLS):
            if is_entry(grid[r][c]):
                start = (r, c)
                break
        if start:
            break

    if not start:
        return [], 0, None

    pq = [(0, start)]
    distances = {start: 0}
    parents = {start: None}
    visited = set()
    visited_order = []

    directions = [(0,1),(0,-1),(1,0),(-1,0)]

    while pq:
        cost, (r, c) = heapq.heappop(pq)
        if (r, c) in visited:
            continue
        visited.add((r, c))
        visited_order.append([r, c])

        if is_available(grid[r][c]) and (r, c) != start:
            path = []
            node = (r, c)
            while node is not None:
                path.append(node)
                node = parents[node]
            path.reverse()
            return path, len(visited_order), (r, c)

        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            if 0 <= nr < ROWS and 0 <= nc < COLS:
                if (nr, nc) in visited:
                    continue
                next_cost = cost + 1
                if next_cost < distances.get((nr, nc), float('inf')):
                    distances[(nr, nc)] = next_cost
                    parents[(nr, nc)] = (r, c)
                    heapq.heappush(pq, (next_cost, (nr, nc)))

    return [], len(visited_order), None


@app.route('/')
def user_panel():
    """User-facing parking navigation panel."""
    return render_template('index.html')


@app.route('/admin')
def admin_panel():
    """Admin control panel."""
    return render_template('admin.html')


@app.route('/state', methods=['GET'])
def get_state():
    """Return full parking layout state."""
    return jsonify({
        'layout': parking_state,
        'floors': FLOORS,
        'rows': ROWS,
        'cols': COLS
    })


@app.route('/run', methods=['POST'])
def run_algorithms():
    """
    Run Dijkstra on the requested floor.
    POST body: { "floor": int }
    """
    data = request.get_json()
    floor_idx = int(data.get('floor', 0))

    if floor_idx < 0 or floor_idx >= FLOORS:
        return jsonify({'error': 'Invalid floor'}), 400

    # Run Dijkstra
    t0 = time.perf_counter()
    dijkstra_path, dijkstra_visited, dijkstra_target = dijkstra(parking_state, floor_idx)
    dijkstra_time = round((time.perf_counter() - t0) * 1000, 4)

    return jsonify({
        'floor': floor_idx,
        'dijkstra': {
            'path': [[r, c] for r, c in dijkstra_path],
            'visited': dijkstra_visited,
            'time_ms': dijkstra_time,
            'target': list(dijkstra_target) if dijkstra_target else None
        }
    })


@app.route('/toggle', methods=['POST'])
def toggle_spot():
    data = request.get_json()
    f = int(data['floor'])
    r = int(data['row'])
    c = int(data['col'])
    new_state = int(data['state'])  # 0=empty, 1=occupied

    if is_entry(parking_state[f][r][c]):
        return jsonify({'error': 'Cannot modify entry gate'}), 400

    # Guard against unexpected states from malformed clients.
    if new_state not in (EMPTY, OCCUPIED):
        new_state = EMPTY

    parking_state[f][r][c] = new_state

    return jsonify({
        'success': True,
        'floor': f,
        'row': r,
        'col': c,
        'state': new_state,
        'layout': parking_state
    })


@app.route('/reset', methods=['POST'])
def reset_layout():
    """Reset parking layout to default."""
    global parking_state
    parking_state = build_default_layout()
    return jsonify({'success': True, 'layout': parking_state})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
