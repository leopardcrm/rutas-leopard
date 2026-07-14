import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { 
  MapPin, 
  User, 
  Users, 
  Clock, 
  Search, 
  PlusCircle, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Calendar, 
  Map as MapIcon, 
  Navigation,
  FileText,
  RefreshCw,
  Info,
  ChevronRight,
  Compass
} from 'lucide-react';

// Distance calculator helper (Haversine formula in meters)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function App() {
  // Application Data States
  const [sellers, setSellers] = useState([]);
  const [clients, setClients] = useState([]);
  const [history, setHistory] = useState([]);
  const [lastReset, setLastReset] = useState('');
  const [loading, setLoading] = useState(true);

  // UI Control States
  const [currentSellerId, setCurrentSellerId] = useState(1);
  const [activeTab, setActiveTab] = useState('clientes'); // 'clientes' | 'registrar' | 'reportes'
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState('hoy'); // 'hoy' | 'semana' | 'mes' | 'todos'
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [visitStatus, setVisitStatus] = useState('Visitado'); // 'Visitado' | 'Cerrado'
  const [observations, setObservations] = useState('');
  const [resetCountdown, setResetCountdown] = useState('');

  // GPS State
  const [gpsPosition, setGpsPosition] = useState(null); // { latitude, longitude, accuracy }
  const [gpsLoading, setGpsLoading] = useState(false);
  const [autoTracking, setAutoTracking] = useState(true);

  // Registration Form State
  const [formName, setFormName] = useState('');
  const [formShop, setFormShop] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');
  const [formMapsUrl, setFormMapsUrl] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState('');

  // Leaflet Map Refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(L.layerGroup());
  const pathLinesGroupRef = useRef(L.layerGroup());
  const gpsMarkerRef = useRef(null);
  const tempMarkerRef = useRef(null); // Click to add client marker

  // Fetch initial data from server
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/data');
      const data = await res.json();
      setSellers(data.sellers || []);
      setClients(data.clients || []);
      setHistory(data.visits_history || []);
      setLastReset(data.last_reset || '');
      
      // Default to first seller if not set
      if (data.sellers && data.sellers.length > 0 && !currentSellerId) {
        setCurrentSellerId(data.sellers[0].id);
      }
    } catch (err) {
      console.error("Error al obtener datos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update Reset Countdown Timer every second
  useEffect(() => {
    if (!lastReset) return;
    
    const interval = setInterval(() => {
      const resetTime = new Date(lastReset);
      resetTime.setHours(resetTime.getHours() + 72); // 72 hours limit
      const now = new Date();
      const diffMs = resetTime - now;

      if (diffMs <= 0) {
        setResetCountdown("¡Reiniciando rutas...");
        fetchData(); // Trigger reload
      } else {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        setResetCountdown(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastReset]);

  // GPS Tracking Effect
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn("Geolocalización no soportada en este navegador.");
      return;
    }

    setGpsLoading(true);
    let watchId = null;

    if (autoTracking) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setGpsPosition({ latitude, longitude, accuracy });
          setGpsLoading(false);
          console.log(`GPS Location: ${latitude}, ${longitude} (±${accuracy}m)`);
        },
        (err) => {
          console.error("Error de GPS:", err);
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [autoTracking]);

  // Leaflet Map Initialization (Runs once)
  useEffect(() => {
    if (mapInstanceRef.current) return;

    // Santa Cruz, Bolivia coordinates center
    const defaultCenter = [-17.7833, -63.1821];
    
    const map = L.map('map', { 
      zoomControl: false,
      attributionControl: false 
    }).setView(defaultCenter, 13);

    // Dark tiles from Stadia or CartoDB (CartoDB Dark Matter is reliable and free without key)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20
    }).addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Add layer groups to map
    markersGroupRef.current.addTo(map);
    pathLinesGroupRef.current.addTo(map);

    // Click on map event for client registration
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      
      // Update form coords if active tab is registrar
      setFormLat(lat.toFixed(6));
      setFormLng(lng.toFixed(6));
      setFormMapsUrl(`https://www.google.com/maps/place/${lat.toFixed(6)},${lng.toFixed(6)}`);

      // Set temp marker
      if (tempMarkerRef.current) {
        tempMarkerRef.current.setLatLng(e.latlng);
      } else {
        const crossIcon = L.divIcon({
          html: `<div style="color: #ef4444; font-size: 20px; font-weight: 800; transform: translate(-2px, -10px);">📍</div>`,
          className: 'temp-register-marker',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        tempMarkerRef.current = L.marker(e.latlng, { icon: crossIcon }).addTo(map);
      }
    });

    mapInstanceRef.current = map;
  }, []);

  // Update Markers & Paths based on state change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // 1. Clear old client markers
    markersGroupRef.current.clearLayers();

    // 2. Draw Client Markers
    clients.forEach(client => {
      // Find client seller details
      const clientSeller = sellers.find(s => s.id === client.seller_id);
      const sellerColor = clientSeller ? clientSeller.color : '#6b7280';
      const sellerInitials = clientSeller ? clientSeller.name.substring(0, 2).toUpperCase() : 'V';

      // Status Colors
      let statusColor = 'var(--status-pending)'; // Yellow
      if (client.status === 'Visitado') statusColor = 'var(--status-visited)'; // Green
      if (client.status === 'Cerrado') statusColor = 'var(--status-closed)'; // Red

      // Highlight if selected
      const isSelected = client.id === selectedClientId;
      const size = isSelected ? 34 : 26;
      const border = isSelected ? '4px solid #fff' : '2px solid #fff';
      const shadow = isSelected ? '0 0 15px rgba(255,255,255,0.7)' : '0 2px 6px rgba(0,0,0,0.5)';

      const htmlContent = `
        <div style="
          background-color: ${statusColor}; 
          width: ${size}px; 
          height: ${size}px; 
          border-radius: 50%; 
          border: ${border}; 
          box-shadow: ${shadow}; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          color: white; 
          font-weight: 800; 
          font-size: ${isSelected ? 11 : 9}px;
          transition: all 0.2s ease;
        ">
          ${sellerInitials}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: htmlContent,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      const marker = L.marker([client.latitude, client.longitude], { icon: customIcon });

      // Popup Content
      const popupHtml = `
        <div style="font-family: var(--font-primary); padding: 4px;">
          <h3>${client.shop_name || 'Sin nombre de negocio'}</h3>
          <p><b>Cliente:</b> ${client.client_name}</p>
          <p><b>Celular:</b> ${client.phone || 'No registrado'}</p>
          <p><b>Vendedor:</b> ${clientSeller ? clientSeller.name : 'Desconocido'}</p>
          <p><b>Estado:</b> <span style="color: ${statusColor}; font-weight: 700;">${client.status}</span></p>
          <hr style="margin: 8px 0; border: 0; border-top: 1px solid var(--border-color);" />
          <div style="display: flex; gap: 8px;">
            <a href="https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}" target="_blank">Abrir en Maps</a>
            ${client.photo_url ? `<a href="${client.photo_url}" target="_blank">Ver Foto</a>` : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      // Marker click state updates
      marker.on('click', () => {
        setSelectedClientId(client.id);
        setShowMobileDrawer(true);
      });

      markersGroupRef.current.addLayer(marker);
    });

    // 3. Clear old Path Lines
    pathLinesGroupRef.current.clearLayers();

    // 4. Draw Route Paths for selected seller visits *Today*
    const today = new Date().toDateString();
    const todayVisits = history
      .filter(h => h.seller_id === currentSellerId && new Date(h.timestamp).toDateString() === today)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (todayVisits.length > 1) {
      const latlngs = [];
      todayVisits.forEach(v => {
        // Find client coords
        const cl = clients.find(c => c.id === v.client_id);
        if (cl) {
          latlngs.push([cl.latitude, cl.longitude]);
        }
      });

      if (latlngs.length > 1) {
        // Draw path line
        const activeSeller = sellers.find(s => s.id === currentSellerId);
        const pathColor = activeSeller ? activeSeller.color : '#3b82f6';

        const polyline = L.polyline(latlngs, {
          color: pathColor,
          weight: 4,
          opacity: 0.7,
          dashArray: '8, 8',
          lineJoin: 'round'
        });

        // Add arrowheads or animations if needed, but standard line is very solid
        pathLinesGroupRef.current.addLayer(polyline);
      }
    }
  }, [clients, sellers, selectedClientId, history, currentSellerId]);

  // Update GPS Marker Position on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !gpsPosition) return;

    const { latitude, longitude, accuracy } = gpsPosition;

    if (gpsMarkerRef.current) {
      gpsMarkerRef.current.setLatLng([latitude, longitude]);
    } else {
      const gpsIcon = L.divIcon({
        className: 'gps-marker',
        html: `<div class="gps-dot-pulse"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      gpsMarkerRef.current = L.marker([latitude, longitude], { icon: gpsIcon }).addTo(map);
    }
  }, [gpsPosition]);

  // Center map on selected client
  const handleClientSelect = (clientId) => {
    setSelectedClientId(clientId);
    const client = clients.find(c => c.id === clientId);
    const map = mapInstanceRef.current;
    
    if (client && map) {
      map.setView([client.latitude, client.longitude], 16);
      
      // Find and open popup for this client marker
      markersGroupRef.current.eachLayer((layer) => {
        const latlng = layer.getLatLng();
        if (latlng.lat === client.latitude && latlng.lng === client.longitude) {
          layer.openPopup();
        }
      });
      
      setShowMobileDrawer(true);
    }
  };

  // Center map on current GPS location
  const centerOnGPS = () => {
    const map = mapInstanceRef.current;
    if (map && gpsPosition) {
      map.setView([gpsPosition.latitude, gpsPosition.longitude], 16);
    } else {
      alert("Esperando señal GPS...");
    }
  };

  // Handle Registration Submit
  const handleRegisterClient = async (e) => {
    e.preventDefault();

    if (!formName || !formLat || !formLng) {
      alert("Por favor rellena Nombre del Cliente, Latitud y Longitud.");
      return;
    }

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: formName,
          shop_name: formShop,
          phone: formPhone,
          latitude: parseFloat(formLat),
          longitude: parseFloat(formLng),
          seller_id: currentSellerId,
          maps_url: formMapsUrl,
          photo_url: formPhotoUrl
        })
      });

      if (res.ok) {
        const newCl = await res.json();
        setClients(prev => [...prev, newCl]);
        
        // Reset Form
        setFormName('');
        setFormShop('');
        setFormPhone('');
        setFormLat('');
        setFormLng('');
        setFormMapsUrl('');
        setFormPhotoUrl('');

        // Remove temporary click marker
        if (tempMarkerRef.current) {
          tempMarkerRef.current.remove();
          tempMarkerRef.current = null;
        }

        setSelectedClientId(newCl.id);
        setActiveTab('clientes');
        
        // Center on new client
        const map = mapInstanceRef.current;
        if (map) map.setView([newCl.latitude, newCl.longitude], 16);

        alert("¡Cliente registrado con éxito!");
      } else {
        alert("Error al registrar cliente.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al registrar.");
    }
  };

  // Trigger check-in visit
  const handleCheckIn = (status) => {
    setVisitStatus(status);
    setObservations('');
    setShowVisitModal(true);
  };

  const submitVisit = async () => {
    if (!selectedClientId) return;
    
    try {
      const res = await fetch(`/api/clients/${selectedClientId}/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_id: currentSellerId,
          status: visitStatus,
          observations: observations,
          latitude_checkin: gpsPosition ? gpsPosition.latitude : null,
          longitude_checkin: gpsPosition ? gpsPosition.longitude : null
        })
      });

      if (res.ok) {
        const data = await res.json();
        
        // Update local clients state
        setClients(prev => prev.map(c => c.id === selectedClientId ? data.client : c));
        
        // Add to local history list
        setHistory(prev => [data.visit, ...prev]);
        
        setShowVisitModal(false);
        alert(`Visita registrada como: ${visitStatus}`);
      } else {
        alert("Error al guardar visita.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión.");
    }
  };

  // Force Manual Reset of routes
  const handleManualReset = async () => {
    if (!window.confirm("¿Estás seguro de restablecer el estado de todos los clientes a 'Pendiente'? Esto no borrará el historial de visitas.")) {
      return;
    }

    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setClients(prev => prev.map(c => ({ ...c, status: "Pendiente" })));
        setLastReset(data.last_reset);
        alert("Rutas restablecidas con éxito.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión.");
    }
  };

  // Filter clients to show
  const filteredClients = clients.filter(c => {
    const matchesSearch = c.client_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.shop_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.phone && c.phone.includes(searchQuery));
    
    // In search/list we display all clients, but highlight who owns it.
    return matchesSearch;
  });

  // Calculate statistics
  const currentSellerClients = clients.filter(c => c.seller_id === currentSellerId);
  const totalOwn = currentSellerClients.length;
  const visitedOwn = currentSellerClients.filter(c => c.status === 'Visitado').length;
  const pendingOwn = currentSellerClients.filter(c => c.status === 'Pendiente').length;
  const closedOwn = currentSellerClients.filter(c => c.status === 'Cerrado').length;

  const currentClient = clients.find(c => c.id === selectedClientId);
  
  // Calculate distance from user GPS to selected client
  let distanceToSelected = null;
  let inRange = false;
  if (currentClient && gpsPosition) {
    distanceToSelected = getDistance(
      gpsPosition.latitude,
      gpsPosition.longitude,
      currentClient.latitude,
      currentClient.longitude
    );
    // User is in range if distance is less than 80 meters
    inRange = distanceToSelected <= 80;
  }

  // Filter visits history
  const filteredHistory = history.filter(h => {
    const date = new Date(h.timestamp);
    const now = new Date();
    
    // Check filter range
    if (historyFilter === 'hoy') {
      return date.toDateString() === now.toDateString();
    } else if (historyFilter === 'semana') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= oneWeekAgo;
    } else if (historyFilter === 'mes') {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return date >= oneMonthAgo;
    }
    return true; // 'todos'
  });

  // Get active seller metadata
  const activeSeller = sellers.find(s => s.id === currentSellerId);
  const activeSellerColor = activeSeller ? activeSeller.color : '#3b82f6';

  return (
    <div className="app-container">
      {/* Sidebar - Left panel on desktop, Top header + Drawer on mobile */}
      <aside className="sidebar glass-panel">
        <div className="sidebar-header">
          <div className="logo-section">
            <div className="logo-icon">📍</div>
            <div>
              <h1 className="logo-title">Rutas Leopard</h1>
              <p className="logo-subtitle">GPS Vendedores v1.0</p>
            </div>
          </div>

          {/* User selector */}
          <div className="user-widget">
            <label className="user-selector-label">Vendedor Activo</label>
            <select 
              value={currentSellerId} 
              onChange={(e) => {
                setCurrentSellerId(parseInt(e.target.value));
                setSelectedClientId(null); // Clear selected client
              }}
              className="custom-select"
              style={{ borderLeft: `4px solid ${activeSellerColor}` }}
            >
              {sellers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab navigation */}
        <div style={{ padding: '0 24px' }}>
          <div className="tabs-nav">
            <button 
              className={`tab-btn ${activeTab === 'clientes' ? 'active' : ''}`}
              onClick={() => { setActiveTab('clientes'); setShowMobileDrawer(true); }}
            >
              <Users />
              Clientes
            </button>
            <button 
              className={`tab-btn ${activeTab === 'registrar' ? 'active' : ''}`}
              onClick={() => { setActiveTab('registrar'); setShowMobileDrawer(true); }}
            >
              <PlusCircle />
              Registrar
            </button>
            <button 
              className={`tab-btn ${activeTab === 'reportes' ? 'active' : ''}`}
              onClick={() => { setActiveTab('reportes'); setShowMobileDrawer(true); }}
            >
              <FileText />
              Historial
            </button>
          </div>
        </div>

        {/* Sidebar Content (Scrollable) */}
        <div className={`sidebar-content ${showMobileDrawer ? 'open' : ''}`}>
          <div className="mobile-pull-bar" onClick={() => setShowMobileDrawer(false)}></div>
          
          {/* Tab 1: Clientes List & Stats */}
          {activeTab === 'clientes' && (
            <>
              {/* Statistics */}
              <div>
                <h3 className="section-title"><Info size={16} /> Tus Estadísticas</h3>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-val green">{visitedOwn}</span>
                    <span className="stat-lbl">Visitados</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-val yellow">{pendingOwn}</span>
                    <span className="stat-lbl">Pendientes</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-val red">{closedOwn}</span>
                    <span className="stat-lbl">Cerrados</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-val" style={{ color: '#fff' }}>{totalOwn}</span>
                    <span className="stat-lbl">Clientes Totales</span>
                  </div>
                </div>
              </div>

              {/* Reset Routes Timer */}
              <div className="timer-panel">
                <div className="timer-info">
                  <span className="timer-lbl">Reinicio en</span>
                  <span className="timer-val">{resetCountdown || 'Calculando...'}</span>
                </div>
                <button onClick={handleManualReset} className="timer-btn" title="Fuerza reinicio inmediato">
                  Reiniciar
                </button>
              </div>

              {/* Clients List */}
              <div className="list-container">
                <h3 className="section-title"><MapPin size={16} /> Lista de Clientes</h3>
                <div className="search-bar">
                  <Search className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Buscar cliente o negocio..." 
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                {loading ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Cargando clientes...</p>
                ) : (
                  <div className="client-list">
                    {filteredClients.map(c => {
                      const isOwn = c.seller_id === currentSellerId;
                      const owner = sellers.find(s => s.id === c.seller_id);
                      return (
                        <div 
                          key={c.id} 
                          className={`client-card status-${c.status} ${selectedClientId === c.id ? 'selected' : ''}`}
                          onClick={() => handleClientSelect(c.id)}
                        >
                          <div className="client-info">
                            <span className="client-name">{c.client_name}</span>
                            <span className="client-shop">{c.shop_name || 'Negocio sin nombre'}</span>
                            <span className="client-owner" style={{ color: owner?.color || '#fff' }}>
                              {isOwn ? 'Tuyo' : owner?.name.split(' ')[0]}
                            </span>
                          </div>
                          <span className={`client-badge-status ${c.status}`}>
                            {c.status}
                          </span>
                        </div>
                      );
                    })}
                    {filteredClients.length === 0 && (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        No se encontraron clientes.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tab 2: Registrar Cliente Form */}
          {activeTab === 'registrar' && (
            <form onSubmit={handleRegisterClient} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 className="section-title"><PlusCircle size={16} /> Nuevo Cliente</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Haz clic en cualquier parte del mapa para marcar las coordenadas o usa tu GPS actual.
              </p>

              <div className="form-group">
                <label className="form-label">Nombre del Cliente *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej. Pablo Galarza"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nombre de la Tienda / Negocio</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formShop} 
                  onChange={(e) => setFormShop(e.target.value)}
                  placeholder="Ej. Taller El Patrón"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Celular / Teléfono</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formPhone} 
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="Ej. 78405301"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Latitud *</label>
                  <input 
                    type="number" 
                    step="0.000001" 
                    className="form-input" 
                    value={formLat} 
                    onChange={(e) => setFormLat(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Longitud *</label>
                  <input 
                    type="number" 
                    step="0.000001" 
                    className="form-input" 
                    value={formLng} 
                    onChange={(e) => setFormLng(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <button 
                  type="button" 
                  className="submit-btn btn-secondary"
                  onClick={() => {
                    if (gpsPosition) {
                      setFormLat(gpsPosition.latitude.toFixed(6));
                      setFormLng(gpsPosition.longitude.toFixed(6));
                      setFormMapsUrl(`https://www.google.com/maps/place/${gpsPosition.latitude.toFixed(6)},${gpsPosition.longitude.toFixed(6)}`);
                    } else {
                      alert("Esperando señal GPS del celular...");
                    }
                  }}
                >
                  <Compass size={16} /> Usar mi Ubicación GPS
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Enlace de Maps (Auto-generado)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formMapsUrl} 
                  onChange={(e) => setFormMapsUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Enlace de Foto (Opcional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={formPhotoUrl} 
                  onChange={(e) => setFormPhotoUrl(e.target.value)}
                  placeholder="Google Drive link de foto"
                />
              </div>

              <button type="submit" className="submit-btn" style={{ background: activeSellerColor }}>
                Registrar Cliente
              </button>
            </form>
          )}

          {/* Tab 3: Reportes e Historial */}
          {activeTab === 'reportes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 className="section-title"><Clock size={16} /> Historial de Visitas</h3>

              {/* Time Filters */}
              <div className="filter-selector">
                <button 
                  className={`filter-btn ${historyFilter === 'hoy' ? 'active' : ''}`}
                  onClick={() => setHistoryFilter('hoy')}
                >
                  Hoy
                </button>
                <button 
                  className={`filter-btn ${historyFilter === 'semana' ? 'active' : ''}`}
                  onClick={() => setHistoryFilter('semana')}
                >
                  Semana
                </button>
                <button 
                  className={`filter-btn ${historyFilter === 'mes' ? 'active' : ''}`}
                  onClick={() => setHistoryFilter('mes')}
                >
                  Mes
                </button>
                <button 
                  className={`filter-btn ${historyFilter === 'todos' ? 'active' : ''}`}
                  onClick={() => setHistoryFilter('todos')}
                >
                  Todo
                </button>
              </div>

              {/* Visits list */}
              <div className="history-list">
                {filteredHistory.map(h => {
                  const seller = sellers.find(s => s.id === h.seller_id);
                  let badgeClass = 'Pendiente';
                  if (h.status === 'Visitado') badgeClass = 'Visitado';
                  if (h.status === 'Cerrado') badgeClass = 'Cerrado';
                  
                  return (
                    <div key={h.id} className="history-card">
                      <div className="history-card-header">
                        <span className="history-shop">{h.shop_name || 'Negocio sin nombre'}</span>
                        <span className={`client-badge-status ${badgeClass}`}>{h.status}</span>
                      </div>
                      <span className="history-date">
                        {new Date(h.timestamp).toLocaleString('es-BO', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                      <span className="history-seller" style={{ color: seller?.color || '#fff' }}>
                        Por: {seller ? seller.name : 'Vendedor'}
                      </span>
                      {h.observations && (
                        <div className="history-obs">
                          "{h.observations}"
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredHistory.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' }}>
                    No hay visitas registradas para este periodo.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Map View Area - Right/Center pane */}
      <main className="map-container">
        {/* Floating actions on top right of map */}
        <div className="map-floating-actions">
          <button onClick={centerOnGPS} className="icon-btn-floating" title="Centrar en mi GPS">
            <Navigation size={18} style={{ color: activeSellerColor }} />
          </button>
          
          <button 
            onClick={() => setAutoTracking(prev => !prev)} 
            className="icon-btn-floating" 
            title={autoTracking ? "Desactivar GPS continuo" : "Activar GPS continuo"}
          >
            <Compass size={18} style={{ color: autoTracking ? '#10b981' : 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Leaflet map div anchor */}
        <div id="map" ref={mapContainerRef}></div>

        {/* Selected Client Floating Action Panel (GPS proximity & visit register trigger) */}
        {currentClient && (
          <div className="floating-overlay-panel glass-panel">
            <div className="overlay-header">
              <div>
                <h4 className="overlay-title">{currentClient.shop_name || 'Tienda sin nombre'}</h4>
                <p className="overlay-subtitle">Cliente: {currentClient.client_name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Asignado a: {sellers.find(s => s.id === currentClient.seller_id)?.name || 'Vendedor'}
                </p>
              </div>

              {/* Close panel button */}
              <button 
                onClick={() => setSelectedClientId(null)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Proximity / GPS Info Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                {distanceToSelected !== null ? (
                  <span className={`distance-badge ${inRange ? 'in-range' : ''}`}>
                    {inRange ? '📍 En Rango de Visita' : `📍 A ${distanceToSelected.toFixed(0)}m de distancia`}
                  </span>
                ) : (
                  <span className="distance-badge">Esperando GPS...</span>
                )}
              </div>
              
              <span className={`client-badge-status ${currentClient.status}`}>
                Estado: {currentClient.status}
              </span>
            </div>

            {/* Visit Registration Button Row - only allow editing own routes */}
            {currentClient.seller_id === currentSellerId ? (
              <div className="overlay-actions-row">
                <button 
                  onClick={() => handleCheckIn('Visitado')} 
                  className="action-status-btn visitado"
                >
                  <CheckCircle2 size={16} />
                  Visitado
                </button>
                
                <button 
                  onClick={() => handleCheckIn('Cerrado')} 
                  className="action-status-btn cerrado"
                >
                  <XCircle size={16} />
                  Cerrado
                </button>

                <button 
                  onClick={async () => {
                    // Quick checkin to Pendiente (reset)
                    if (window.confirm("¿Restablecer este cliente a Pendiente?")) {
                      const res = await fetch(`/api/clients/${currentClient.id}/visit`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ seller_id: currentSellerId, status: 'Pendiente', observations: 'Restablecido manualmente' })
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setClients(prev => prev.map(c => c.id === currentClient.id ? data.client : c));
                        setHistory(prev => [data.visit, ...prev]);
                      }
                    }
                  }} 
                  className="action-status-btn pendiente"
                >
                  <AlertCircle size={16} />
                  Pendiente
                </button>
              </div>
            ) : (
              <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', fontSize: '12px', color: 'var(--status-closed)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <AlertCircle size={14} />
                <span>Solo lectura. Este cliente pertenece a otro vendedor y no puedes editarlo.</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Observation modal when registering a visit */}
      {showVisitModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 className="section-title" style={{ marginBottom: '16px' }}>
              Registrar Reporte de Visita
            </h3>
            
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Estableciendo estado: <span style={{ 
                color: visitStatus === 'Visitado' ? 'var(--status-visited)' : 'var(--status-closed)',
                fontWeight: 'bold'
              }}>{visitStatus}</span>
            </p>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Observaciones / Comentario de la Visita</label>
              <textarea 
                className="form-input" 
                rows="4"
                style={{ resize: 'none', height: '100px' }}
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Escribe comentarios sobre la visita (Ej: Pidió 2 cajas de Coca-Cola, Tienda cerrada por feriado, etc.)"
              ></textarea>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                onClick={() => setShowVisitModal(false)} 
                className="submit-btn btn-secondary"
                style={{ flex: 1, marginTop: 0 }}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={submitVisit} 
                className="submit-btn"
                style={{ flex: 2, background: activeSellerColor, marginTop: 0 }}
              >
                Guardar Visita
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
