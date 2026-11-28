import { useViewFormGuard, useViewActionGuard } from '../../components/Common/viewSafety';
import React, { useMemo, useState } from 'react';
import { Box, Car, Check, Gift, HeartHandshake, PawPrint, Plane, Plus, Printer, Trash2, Wrench } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { addDaysIso } from '../../core/temporal';
import { ModalDialog } from '../../components/Common/ModalDialog';

export const TravelPeopleHomeView: React.FC<{ mode: 'travel' | 'people' | 'home_assets' }> = ({ mode }) => {
  const { settings, records, logicalToday, pushToast } = useApp();
  const guardForm = useViewFormGuard(message => pushToast(message, { tone: 'danger' }));
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'danger' }));


  // Travel & Party state
  const [tripTitle, setTripTitle] = useState('');
  const [tripStart, setTripStart] = useState(addDaysIso(logicalToday, 14));
  const [tripDays, setTripDays] = useState(5);
  const [tripTravelers, setTripTravelers] = useState(2);
  const [tripNotes, setTripNotes] = useState('');
  const [partyTitle, setPartyTitle] = useState('');
  const [partyGuests, setPartyGuests] = useState(8);

  // People & Gifts state
  const [personName, setPersonName] = useState('');
  const [personCadence, setPersonCadence] = useState(14);
  const [personCoffee, setPersonCoffee] = useState('');
  const [personSizes, setPersonSizes] = useState('');
  const [personToDelete, setPersonToDelete] = useState<{ id: string; name: string } | null>(null);
  const [giftIdea, setGiftIdea] = useState('');
  const [giftFor, setGiftFor] = useState('');
  const [giftBudget, setGiftBudget] = useState(50);

  // Home Assets, Vehicles, Pets/Plants & Storage Locator state
  const [assetName, setAssetName] = useState('');
  const [assetSpec, setAssetSpec] = useState('');
  const [storageItemName, setStorageItemName] = useState('');
  const [storageBinLocation, setStorageBinLocation] = useState('Garage Bin #4');
  const [petPlantName, setPetPlantName] = useState('');
  const [petPlantCare, setPetPlantCare] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [vehicleMileage, setVehicleMileage] = useState(45000);

  const trips = useMemo(() => records.filter((r) => r.type === 'trip'), [records]);
  const parties = useMemo(() => records.filter((r) => r.type === 'party'), [records]);
  const people = useMemo(() => records.filter((r) => r.type === 'person'), [records]);
  const gifts = useMemo(() => records.filter((r) => r.type === 'gift'), [records]);
  const homeAssets = useMemo(() => records.filter((r) => r.type === 'home_asset'), [records]);
  const storageItems = useMemo(() => records.filter((r) => r.type === 'storage_item'), [records]);
  const petsPlants = useMemo(() => records.filter((r) => r.type === 'pet_plant'), [records]);
  const vehicles = useMemo(() => records.filter((r) => r.type === 'vehicle'), [records]);

  if (mode === 'travel') {
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <div className="dp-between">
          <h2>
            <Plane size={20} style={{ verticalAlign: '-3px' }} /> Travel Itineraries, Smart Packing & Party Hosting
          </h2>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => window.print()}>
            <Printer size={14} /> Print Offline Itinerary / Packing List
          </button>
        </div>

        <form
          className="dp-card dp-stack"
          style={{ padding: 12 }}
          onSubmit={guardForm('form-1', async (e) => {
            e.preventDefault();
            if (!tripTitle.trim()) return;
            const packing = [
              { item: 'Outfits / Tops', qty: tripDays * tripTravelers, packed: false },
              { item: 'Socks & Underwear', qty: (tripDays + 1) * tripTravelers, packed: false },
              { item: 'Chargers & Adapters', qty: tripTravelers, packed: false },
              { item: 'Toiletries Bag', qty: tripTravelers, packed: false },
              { item: 'Pre-departure: Pause mail & water plants', qty: 1, packed: false },
            ];
            await createRecord('trip', tripTitle.trim(), {
              startDate: tripStart,
              endDate: addDaysIso(tripStart, Math.max(1, tripDays - 1)),
              days: tripDays,
              travelers: tripTravelers,
              itinerary: tripNotes || 'Flight & lodging details…',
              packing,
            });
            setTripTitle('');
            setTripNotes('');
            pushToast('Created trip with auto-multiplied packing list (projected to Countdowns!)');
          })}
        >
          <div className="dp-row">
            <input className="dp-input" style={{ flex: 2 }} placeholder="Trip destination…" value={tripTitle} onChange={(e) => setTripTitle(e.target.value)} />
            <input type="date" className="dp-input" style={{ width: 'auto' }} value={tripStart} onChange={(e) => setTripStart(e.target.value)} />
            <label className="dp-row">
              <span className="dp-muted">Duration:</span>
              <input type="number" min={1} max={60} className="dp-input" style={{ width: 64 }} value={tripDays} onChange={(e) => setTripDays(Number(e.target.value) || 3)} />
              <span className="dp-muted">days</span>
            </label>
            <label className="dp-row">
              <span className="dp-muted">Travelers:</span>
              <input type="number" min={1} max={12} className="dp-input" style={{ width: 60 }} value={tripTravelers} onChange={(e) => setTripTravelers(Number(e.target.value) || 1)} />
              <span className="dp-muted">ppl</span>
            </label>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Plan Trip</button>
          </div>
          <input className="dp-input" placeholder="Flights, lodging confirmations, addresses…" value={tripNotes} onChange={(e) => setTripNotes(e.target.value)} />
        </form>

        <div className="dp-grid-2">
          {trips.map((tr) => {
            const p = tr.payload as {
              startDate: string;
              endDate: string;
              travelers: number;
              itinerary: string;
              packing: Array<{ item: string; qty: number; packed: boolean }>;
            };
            return (
              <div key={tr.id} className="dp-card dp-stack" style={{ padding: 14 }}>
                <div className="dp-between">
                  <strong>✈️ {tr.title}</strong>
                  <div className="dp-row" style={{ gap: 6 }}>
                    <span className="dp-pill">{p.startDate} → {p.endDate} ({p.travelers} ppl)</span>
                    <button type="button" className="dp-icon-btn" title="Delete trip" onClick={() => void softDeleteRecord(tr.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>{p.itinerary}</p>
                <div className="dp-stack" style={{ gap: 4 }}>
                  {(p.packing ?? []).map((pk, idx) => (
                    <label key={idx} className="dp-row" style={{ cursor: 'pointer', fontSize: '0.86rem' }}>
                      <input
                        type="checkbox"
                        checked={pk.packed}
                        onChange={() =>
                          void updateRecord(tr.id, (c) => ({
                            ...c,
                            payload: {
                              ...c.payload,
                              packing: p.packing.map((x, i) => (i === idx ? { ...x, packed: !x.packed } : x)),
                            },
                          }))
                        }
                      />
                      <span style={{ textDecoration: pk.packed ? 'line-through' : undefined }}>
                        {pk.item} × {pk.qty}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Party Hosting Mode */}
        <div className="dp-card dp-stack">
          <h4>🎉 Party Hosting Mode (RSVPs & Auto-Scaling Menu Count)</h4>
          <form
            className="dp-row"
            onSubmit={guardForm('form-2', async (e) => {
              e.preventDefault();
              if (!partyTitle.trim()) return;
              await createRecord('party', partyTitle.trim(), { guestCount: partyGuests, dietaryNotes: 'None', rsvps: [] });
              setPartyTitle('');
              pushToast('Created party hosting workspace');
            })}
          >
            <input className="dp-input" style={{ flex: 2 }} placeholder="Gathering / dinner party…" value={partyTitle} onChange={(e) => setPartyTitle(e.target.value)} />
            <label className="dp-row">
              <span className="dp-muted">Guests:</span>
              <input type="number" min={2} max={200} className="dp-input" style={{ width: 72 }} value={partyGuests} onChange={(e) => setPartyGuests(Number(e.target.value) || 4)} />
            </label>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Create Party</button>
          </form>
          {parties.map((pt) => {
            const p = pt.payload as { guestCount: number };
            return (
              <div key={pt.id} className="dp-between" style={{ padding: 8, background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                <strong>{pt.title} ({p.guestCount} guests — recipe scale factor {(p.guestCount / 4).toFixed(1)}×)</strong>
                <div className="dp-row">
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void updateRecord(pt.id, (c) => ({ ...c, payload: { ...c.payload, guestCount: Math.max(1, p.guestCount - 1) } }))}>−1 Guest</button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void updateRecord(pt.id, (c) => ({ ...c, payload: { ...c.payload, guestCount: p.guestCount + 1 } }))}>+1 Guest</button>
                  <button type="button" className="dp-icon-btn" title="Delete party" onClick={() => void softDeleteRecord(pt.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === 'people') {
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <h2>
          <HeartHandshake size={20} style={{ verticalAlign: '-3px' }} /> People, Keep-in-Touch & Gift Planner
        </h2>

        <form
          className="dp-card dp-row"
          style={{ padding: 12 }}
          onSubmit={guardForm('form-3', async (e) => {
            e.preventDefault();
            if (!personName.trim()) return;
            await createRecord('person', personName.trim(), {
              keepInTouchDays: personCadence,
              nextReachOutDate: addDaysIso(logicalToday, personCadence),
              favoriteCoffee: personCoffee,
              sizes: personSizes,
            });
            setPersonName('');
            setPersonCoffee('');
            setPersonSizes('');
            pushToast('Saved relationship card');
          })}
        >
          <input className="dp-input" style={{ flex: 2 }} placeholder="Person's name…" value={personName} onChange={(e) => setPersonName(e.target.value)} />
          <input className="dp-input" style={{ flex: 1 }} placeholder="Favorite coffee / food…" value={personCoffee} onChange={(e) => setPersonCoffee(e.target.value)} />
          <input className="dp-input" style={{ flex: 1 }} placeholder="Clothing / shoe sizes…" value={personSizes} onChange={(e) => setPersonSizes(e.target.value)} />
          <label className="dp-row">
            <span className="dp-muted">Keep in touch every:</span>
            <input type="number" min={1} max={365} className="dp-input" style={{ width: 64 }} value={personCadence} onChange={(e) => setPersonCadence(Number(e.target.value) || 14)} />
            <span className="dp-muted">days</span>
          </label>
          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm"><Plus size={14} /> Add Person</button>
        </form>

        <div className="dp-grid-2">
          {people.map((pr) => {
            const p = pr.payload as { keepInTouchDays: number; nextReachOutDate: string; favoriteCoffee?: string; sizes?: string };
            return (
              <div key={pr.id} className="dp-card dp-stack" style={{ padding: 12, gap: 6 }}>
                <div className="dp-between">
                  <strong>{pr.title}</strong>
                  <span className="dp-pill">Next check-in: {p.nextReachOutDate}</span>
                </div>
                <div className="dp-muted" style={{ fontSize: '0.82rem' }}>
                  {p.favoriteCoffee ? `☕ ${p.favoriteCoffee} · ` : ''}{p.sizes ? `👕 ${p.sizes}` : ''}
                </div>
                <div className="dp-row">
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary dp-btn-sm"
                    onClick={async () => {
                      const next = addDaysIso(logicalToday, p.keepInTouchDays || 14);
                      await updateRecord(pr.id, (c) => ({ ...c, payload: { ...c.payload, nextReachOutDate: next } }));
                      pushToast(`Caught up with ${pr.title}! Next gentle nudge: ${next}`);
                    }}
                  >
                    <Check size={13} /> Caught Up Today
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-danger dp-btn-sm"
                    onClick={() => setPersonToDelete({ id: pr.id, name: pr.title })}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Gift Planner */}
        <div className="dp-card dp-stack">
          <h4><Gift size={15} /> Gift Planner</h4>
          <form
            className="dp-row"
            onSubmit={guardForm('form-4', async (e) => {
              e.preventDefault();
              if (!giftIdea.trim()) return;
              await createRecord('gift', giftIdea.trim(), { recipient: giftFor || 'Friend', budget: giftBudget, stage: 'Idea' });
              setGiftIdea('');
              pushToast('Saved gift idea');
            })}
          >
            <input className="dp-input" style={{ flex: 2 }} placeholder="Gift idea…" value={giftIdea} onChange={(e) => setGiftIdea(e.target.value)} />
            <input className="dp-input" style={{ flex: 1 }} placeholder="For whom?" value={giftFor} onChange={(e) => setGiftFor(e.target.value)} />
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted">$</span>
              <input type="number" className="dp-input" style={{ width: 84 }} value={giftBudget} onChange={(e) => setGiftBudget(Number(e.target.value) || 0)} />
            </label>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Add Gift</button>
          </form>
          {gifts.map((g) => {
            const p = g.payload as { recipient: string; budget: number; stage: string };
            const stages = ['Idea', 'Purchased', 'Wrapped', 'Delivered'];
            const nextStage = stages[(stages.indexOf(p.stage) + 1) % stages.length];
            return (
              <div key={g.id} className="dp-between" style={{ padding: 8, background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                <span><strong>{g.title}</strong> for {p.recipient} (${p.budget})</span>
                <div className="dp-row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => void updateRecord(g.id, (c) => ({ ...c, payload: { ...c.payload, stage: nextStage } }))}
                  >
                    Stage: {p.stage} → {nextStage}
                  </button>
                  <button type="button" className="dp-icon-btn" title="Delete gift idea" onClick={() => void softDeleteRecord(g.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Explicit Person Cascade Modal (Section 15.05: unlink or trash linked Birthdays) */}
        <ModalDialog open={Boolean(personToDelete)} onClose={() => setPersonToDelete(null)} title={`Delete ${personToDelete?.name || 'Person'}?`}>
          <p className="dp-muted" style={{ margin: 0 }}>
            How should any linked Birthdays or Anniversaries for {personToDelete?.name} be handled?
          </p>
          <div className="dp-row" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="dp-btn"
              onClick={guardAction('action-1', async () => {
                if (!personToDelete) return;
                await softDeleteRecord(personToDelete.id, { personBirthdayAction: 'unlink' });
                setPersonToDelete(null);
                pushToast('Moved person to Trash and kept Birthdays unlinked', { canUndo: true });
              })}
            >
              Keep Birthdays (Unlink)
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-danger"
              onClick={guardAction('action-2', async () => {
                if (!personToDelete) return;
                await softDeleteRecord(personToDelete.id, { personBirthdayAction: 'trash' });
                setPersonToDelete(null);
                pushToast('Moved person & linked Birthdays to Trash', { canUndo: true });
              })}
            >
              Also Trash Linked Birthdays
            </button>
          </div>
        </ModalDialog>
      </div>
    );
  }

  // Home Assets, Vehicles, Pets/Plants & Storage Locator (Section 13.07)
  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <h2>
        <Wrench size={20} style={{ verticalAlign: '-3px' }} /> Home Asset Vault, Vehicles, Pets, Plants & Storage Locator
      </h2>

      <div className="dp-grid-2">
        {/* Room/Zone/Shelf/Bin Storage Locator (indexed in Global Fuzzy Search!) */}
        <div className="dp-card dp-stack">
          <h4><Box size={15} /> Storage Bin Locator (Global Search Indexed)</h4>
          <form
            className="dp-row"
            onSubmit={guardForm('form-5', async (e) => {
              e.preventDefault();
              if (!storageItemName.trim()) return;
              await createRecord('storage_item', storageItemName.trim(), { binLocation: storageBinLocation.trim() });
              setStorageItemName('');
              pushToast('Indexed storage item for Global Search');
            })}
          >
            <input className="dp-input" style={{ flex: 1 }} placeholder='Item (e.g., "holiday lights")' value={storageItemName} onChange={(e) => setStorageItemName(e.target.value)} />
            <input className="dp-input" style={{ flex: 1 }} placeholder="Room / Shelf / Bin #" value={storageBinLocation} onChange={(e) => setStorageBinLocation(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Save</button>
          </form>
          {storageItems.map((si) => (
            <div key={si.id} className="dp-between" style={{ fontSize: '0.86rem' }}>
              <strong>{si.title}</strong>
              <div className="dp-row" style={{ gap: 6 }}>
                <span className="dp-pill highlight">📦 {String((si.payload as { binLocation?: string }).binLocation)}</span>
                <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} title="Delete storage item" onClick={() => void softDeleteRecord(si.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Home Asset Vault */}
        <div className="dp-card dp-stack">
          <h4>Home Assets (Filters, Paint Codes, Serials)</h4>
          <form
            className="dp-row"
            onSubmit={guardForm('form-6', async (e) => {
              e.preventDefault();
              if (!assetName.trim()) return;
              await createRecord('home_asset', assetName.trim(), { modelNumber: assetSpec });
              setAssetName('');
              setAssetSpec('');
              pushToast('Saved home asset');
            })}
          >
            <input className="dp-input" style={{ flex: 1 }} placeholder="Asset (e.g., HVAC Furnace)" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
            <input className="dp-input" style={{ flex: 1 }} placeholder="Filter size / paint code / serial" value={assetSpec} onChange={(e) => setAssetSpec(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Save</button>
          </form>
          {homeAssets.map((a) => (
            <div key={a.id} className="dp-between" style={{ fontSize: '0.86rem' }}>
              <strong>{a.title}</strong>
              <div className="dp-row" style={{ gap: 6 }}>
                <span className="dp-muted">{String((a.payload as { modelNumber?: string }).modelNumber || '')}</span>
                <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} title="Delete home asset" onClick={() => void softDeleteRecord(a.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Vehicle Service Logs */}
        <div className="dp-card dp-stack">
          <h4><Car size={15} /> Vehicle Service Logs</h4>
          <form
            className="dp-row"
            onSubmit={guardForm('form-7', async (e) => {
              e.preventDefault();
              if (!vehicleName.trim()) return;
              await createRecord('vehicle', vehicleName.trim(), { mileage: vehicleMileage, nextOilChangeMileage: vehicleMileage + 5000 });
              setVehicleName('');
              pushToast('Saved vehicle service log');
            })}
          >
            <input className="dp-input" style={{ flex: 1 }} placeholder="Vehicle (e.g., Subaru Outback)" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} />
            <label className="dp-row" style={{ gap: 4 }}>
              <input type="number" className="dp-input" style={{ width: 96 }} value={vehicleMileage} onChange={(e) => setVehicleMileage(Number(e.target.value) || 0)} />
              <span className="dp-muted">mi</span>
            </label>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Save</button>
          </form>
          {vehicles.map((v) => {
            const p = v.payload as { mileage: number; nextOilChangeMileage: number };
            return (
              <div key={v.id} className="dp-between" style={{ fontSize: '0.86rem' }}>
                <strong>{v.title}</strong>
                <div className="dp-row" style={{ gap: 6 }}>
                  <span className="dp-pill">{p.mileage.toLocaleString()} mi · Next oil: {p.nextOilChangeMileage.toLocaleString()} mi</span>
                  <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} title="Delete vehicle" onClick={() => void softDeleteRecord(v.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pet & Plant Care Cards */}
        <div className="dp-card dp-stack">
          <h4><PawPrint size={15} /> Pet & Plant Care Cards</h4>
          <form
            className="dp-row"
            onSubmit={guardForm('form-8', async (e) => {
              e.preventDefault();
              if (!petPlantName.trim()) return;
              await createRecord('pet_plant', petPlantName.trim(), { careNotes: petPlantCare });
              setPetPlantName('');
              setPetPlantCare('');
              pushToast('Saved care card');
            })}
          >
            <input className="dp-input" style={{ flex: 1 }} placeholder="Pet or Plant name…" value={petPlantName} onChange={(e) => setPetPlantName(e.target.value)} />
            <input className="dp-input" style={{ flex: 1 }} placeholder="Feeding / vet / watering light notes" value={petPlantCare} onChange={(e) => setPetPlantCare(e.target.value)} />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Save</button>
          </form>
          {petsPlants.map((pp) => (
            <div key={pp.id} className="dp-between" style={{ fontSize: '0.86rem' }}>
              <strong>{pp.title}</strong>
              <div className="dp-row" style={{ gap: 6 }}>
                <span className="dp-muted">{String((pp.payload as { careNotes?: string }).careNotes || '')}</span>
                <button type="button" className="dp-icon-btn" style={{ width: 22, height: 22 }} title="Delete care card" onClick={() => void softDeleteRecord(pp.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
