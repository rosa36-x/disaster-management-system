'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Database, History, Boxes, Truck, GitMerge } from 'lucide-react';
import { api } from '@/lib/api';

function extractRows(result, key) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.[key])) return result[key];
  if (Array.isArray(result?.[`${key}s`])) return result[`${key}s`];
  return [];
}

function Table({ columns, rows, empty = 'No records found.' }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key} style={{
                padding: '12px 14px', textAlign: 'left',
                borderBottom: '1px solid var(--border, #ddd)',
                whiteSpace: 'nowrap'
              }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 18, opacity: 0.65 }}>
                {empty}
              </td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={row.history_id ?? row.match_id ?? row.supply_id ?? row.vehicle_id ?? index}>
              {columns.map(([key]) => (
                <td key={key} style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--border, #eee)',
                  whiteSpace: 'nowrap'
                }}>
                  {row[key] === null || row[key] === undefined || row[key] === ''
                    ? '—'
                    : String(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ icon: Icon, title, description, children }) {
  return (
    <section style={{
      background: 'var(--card, var(--surface, #fff))',
      border: '1px solid var(--border, #ddd)',
      borderRadius: 14,
      padding: 20,
      minWidth: 0
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <Icon size={21} style={{ flexShrink: 0 }} />
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 13, opacity: 0.7, margin: '6px 0 0' }}>
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function DatabaseActivityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [matches, setMatches] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [lastUpdated, setLastUpdated] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [requestResult, matchResult, supplyResult, vehicleResult] =
        await Promise.all([
          api('/requests'),
          api('/matches'),
          api('/supplies'),
          api('/vehicles')
        ]);

      const requests = extractRows(requestResult, 'requests');
      const matchRows = extractRows(matchResult, 'matches');
      const supplyRows = extractRows(supplyResult, 'supplies');
      const vehicleRows = extractRows(vehicleResult, 'vehicles');

      const recentRequests = [...requests]
        .filter(r => r.request_id != null)
        .sort((a, b) => Number(b.request_id) - Number(a.request_id))
        .slice(0, 15);

      const historyResults = await Promise.allSettled(
        recentRequests.map(r => api(`/requests/${r.request_id}/history`))
      );

      const failed = historyResults.filter(r => r.status === 'rejected');

      const historyRows = historyResults.flatMap((result, index) => {
        if (result.status !== 'fulfilled') return [];

        const request = recentRequests[index];
        const entries = extractRows(result.value, 'history');

        return entries.map(entry => ({
          ...entry,
          request_id: request.request_id,
          victim_name: request.victim_name || '—'
        }));
      });

      historyRows.sort((a, b) =>
        Number(b.history_id) - Number(a.history_id)
      );

      setHistory(historyRows);
      setMatches(matchRows);
      setSupplies(supplyRows);
      setVehicles(vehicleRows);
      setLastUpdated(new Date().toLocaleTimeString());

      if (failed.length) {
        setError(
          `Could not load history for ${failed.length} request(s). ` +
          String(failed[0].reason?.message || '')
        );
      }
    } catch (err) {
      setError(err.message || 'Could not load database activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', flexWrap: 'wrap', gap: 14
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={26} />
            <h1 style={{ fontSize: 27, fontWeight: 750, margin: 0 }}>
              Database Activity
            </h1>
          </div>
          <p style={{ opacity: 0.7, marginTop: 9 }}>
            Live MySQL records showing request triggers, matching procedures,
            inventory and vehicle status.
          </p>
          {lastUpdated && (
            <p style={{ fontSize: 12, opacity: 0.6 }}>
              Last refreshed: {lastUpdated}
            </p>
          )}
        </div>

        <button
          onClick={refresh}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 17px', borderRadius: 9,
            border: '1px solid var(--border, #ccc)',
            cursor: loading ? 'wait' : 'pointer',
            background: 'var(--card, #fff)',
            color: 'inherit'
          }}
        >
          <RefreshCw size={16} />
          {loading ? 'Refreshing...' : 'Refresh activity'}
        </button>
      </div>

      {error && (
        <div role="alert" style={{
          padding: 14, borderRadius: 9,
          border: '1px solid #d88',
          color: '#b33'
        }}>
          {error}
        </div>
      )}

      <Panel
        icon={History}
        title="Request Status History"
        description="Actual records written to request_history by database triggers. Showing history for up to 15 recent requests."
      >
        <Table
          columns={[
            ['history_id', 'Event ID'],
            ['request_id', 'Request ID'],
            ['victim_name', 'Victim'],
            ['old_status', 'Previous status'],
            ['new_status', 'New status'],
            ['changed_at', 'Timestamp']
          ]}
          rows={history}
          empty={loading ? 'Loading history...' : 'No request history found.'}
        />
      </Panel>

      <Panel
        icon={GitMerge}
        title="Delivery Assignments"
        description="Assignments created through the matching stored procedures. These are current assignment records."
      >
        <Table
          columns={[
            ['match_id', 'Match ID'],
            ['request_id', 'Request ID'],
            ['victim_name', 'Victim'],
            ['resource_type', 'Resource'],
            ['assigned_qty', 'Quantity'],
            ['supply_location', 'Supply location'],
            ['vehicle_id', 'Vehicle'],
            ['request_status', 'Request status']
          ]}
          rows={matches}
          empty={loading ? 'Loading assignments...' : 'No assignments found.'}
        />
      </Panel>

      <Panel
        icon={Boxes}
        title="Current Supply Inventory"
        description="Current stock quantities. Matching triggers deduct stock, but this table is not a historical inventory audit log."
      >
        <Table
          columns={[
            ['supply_id', 'Supply ID'],
            ['resource_type', 'Resource'],
            ['quantity', 'Remaining quantity'],
            ['location_type', 'Location type'],
            ['location_name', 'Location']
          ]}
          rows={supplies}
          empty={loading ? 'Loading supplies...' : 'No supply records found.'}
        />
      </Panel>

      <Panel
        icon={Truck}
        title="Vehicle Status"
        description="Current fleet state. Matching assigns vehicles, while delivery completion makes them available again."
      >
        <Table
          columns={[
            ['vehicle_id', 'Vehicle ID'],
            ['capacity', 'Capacity'],
            ['status', 'Status'],
            ['latitude', 'Latitude'],
            ['longitude', 'Longitude']
          ]}
          rows={vehicles}
          empty={loading ? 'Loading vehicles...' : 'No vehicles found.'}
        />
      </Panel>
    </div>
  );
}
