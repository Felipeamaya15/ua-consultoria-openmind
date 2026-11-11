import { useEffect, useState } from 'react';

import {
  fetchBlueTerritory,
  type BlueDestination,
  type BlueRegion,
} from '../../services/blueExpressService';

export interface BlueDestinationSelection {
  codes: BlueDestination;
  regionName: string;
  communeName: string;
  districtName: string;
}

interface Props {
  value: BlueDestinationSelection | null;
  onChange: (value: BlueDestinationSelection | null) => void;
  disabled?: boolean;
}

export default function BlueExpressDestination({
  value,
  onChange,
  disabled = false,
}: Props) {
  const [regions, setRegions] = useState<BlueRegion[]>([]);
  const [regionCode, setRegionCode] = useState('');
  const [communeCode, setCommuneCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');

    fetchBlueTerritory(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setRegions(result);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setRegions([]);
          setError(
            reason instanceof Error
              ? reason.message
              : 'No se pudo cargar el catálogo territorial.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [attempt]);

  // Restaura una selección completa recibida desde el formulario padre.
  useEffect(() => {
    if (value) {
      setRegionCode(String(value.codes.region_code));
      setCommuneCode(String(value.codes.commune_code));
    }
  }, [value]);

  const selectedRegion = regions.find(
    (region) => String(region.code) === regionCode,
  );

  const selectedCommune = selectedRegion?.communes.find(
    (commune) => String(commune.code) === communeCode,
  );

  const controlsDisabled = disabled || loading || Boolean(error);

  const selectClass =
    'mt-1 w-full rounded-lg border border-gray-300 bg-white p-2 ' +
    'text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100';

  function changeRegion(nextCode: string) {
    setRegionCode(nextCode);
    setCommuneCode('');
    onChange(null);
  }

  function changeCommune(nextCode: string) {
    setCommuneCode(nextCode);
    onChange(null);
  }

  function changeDistrict(nextCode: string) {
    const district = selectedCommune?.districts.find(
      (entry) => entry.code === nextCode,
    );

    if (!selectedRegion || !selectedCommune || !district) {
      onChange(null);
      return;
    }

    onChange({
      codes: {
        region_code: selectedRegion.code,
        commune_code: selectedCommune.code,
        district_code: district.code,
      },
      regionName: selectedRegion.name,
      communeName: selectedCommune.name,
      districtName: district.name,
    });
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="font-semibold">Destino de Blue Express</legend>

      <p className="text-sm text-gray-600">
        Selecciona la localidad correspondiente a tu dirección de entrega.
      </p>

      {loading && (
        <p role="status" className="text-sm text-gray-600">
          Cargando regiones y localidades…
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          <p>{error}</p>
          <button
            type="button"
            className="mt-2 underline"
            disabled={disabled}
            onClick={() => {
              setRegionCode('');
              setCommuneCode('');
              onChange(null);
              setAttempt((current) => current + 1);
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      <label className="block text-sm">
        Región
        <select
          className={selectClass}
          value={regionCode}
          disabled={controlsDisabled}
          onChange={(event) => changeRegion(event.target.value)}
        >
          <option value="">Selecciona una región</option>
          {regions.map((region) => (
            <option key={region.code} value={region.code}>
              {region.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Comuna
        <select
          className={selectClass}
          value={communeCode}
          disabled={controlsDisabled || !selectedRegion}
          onChange={(event) => changeCommune(event.target.value)}
        >
          <option value="">Selecciona una comuna</option>
          {selectedRegion?.communes.map((commune) => (
            <option key={commune.code} value={commune.code}>
              {commune.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Localidad
        <select
          className={selectClass}
          value={
            value
            && String(value.codes.region_code) === regionCode
            && String(value.codes.commune_code) === communeCode
              ? value.codes.district_code
              : ''
          }
          disabled={controlsDisabled || !selectedCommune}
          onChange={(event) => changeDistrict(event.target.value)}
        >
          <option value="">Selecciona una localidad</option>
          {selectedCommune?.districts.map((district) => (
            <option key={district.code} value={district.code}>
              {district.name}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}