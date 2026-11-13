"""Valida y comprime videos NUEVOS en un subproceso local acotado.

Los videos existentes en almacenamiento no pasan nuevamente por este codigo.
No descarga enlaces remotos ni ejecuta programas que vengan en el archivo.
"""
import json
import subprocess
import sys
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from tempfile import TemporaryDirectory

MAX_INPUT_VIDEO_BYTES = 20 * 1024 * 1024
VIDEO_PROFILES = {
    'section': {'seconds': 15, 'bytes': 4 * 1024 * 1024},
    'product': {'seconds': 10, 'bytes': 3 * 1024 * 1024},
}


@dataclass(frozen=True)
class VideoUpload:
    data: bytes
    extension: str
    mime: str
    width: int
    height: int


def inspect_local_video(filename, max_seconds=20):
    import av
    # Limits are applied in the child process, also on Linux.
    with av.open(filename, options={'protocol_whitelist': 'file,pipe'}) as container:
        videos = container.streams.video
        if len(videos) != 1 or len(container.streams) > 2:
            raise ValueError('format')
        stream = videos[0]
        codec = stream.codec_context.name
        with open(filename, 'rb') as source:
            head = source.read(4096)
        if head[4:8] == b'ftyp' and 'mp4' in container.format.name and codec == 'h264':
            extension, mime = 'mp4', 'video/mp4'
        elif head.startswith(b'\x1aE\xdf\xa3') and b'webm' in head and codec in ('vp8', 'vp9', 'av1'):
            extension, mime = 'webm', 'video/webm'
        else:
            raise ValueError('format')
        width, height = stream.codec_context.width, stream.codec_context.height
        if not 0 < width <= 4096 or not 0 < height <= 4096:
            raise ValueError('resolution')
        declared = (container.duration or 0) / av.time_base
        if declared > max_seconds + .001:
            raise ValueError('duration')
        frames, end, start = 0, 0., None
        for frame in container.decode(video=0):
            frames += 1
            if frames > 2400 or frame.pts is None:
                raise ValueError('duration')
            timestamp = float(frame.pts * frame.time_base)
            if start is None:
                start = timestamp
            frame_duration = (
                float(frame.duration * frame.time_base)
                if frame.duration else 1 / float(stream.average_rate or 30)
            )
            end = max(end, timestamp - start + frame_duration)
            if end > max_seconds + .001:
                raise ValueError('duration')
        if not frames or end <= 0:
            raise ValueError('format')
        return dict(extension=extension, mime=mime, width=width, height=height)


def encode_local_video(filename, destination, kind):
    import av
    if kind not in VIDEO_PROFILES:
        raise ValueError('format')
    profile = VIDEO_PROFILES[kind]
    inspect_local_video(filename, profile['seconds'])

    with av.open(filename, options={'protocol_whitelist': 'file,pipe'}) as source:
        input_stream = source.streams.video[0]
        width, height = input_stream.codec_context.width, input_stream.codec_context.height
        smaller, larger = min(width, height), max(width, height)
        scale = min(1., 720 / smaller, 1280 / larger)
        new_width = max(2, int(width * scale) // 2 * 2)
        new_height = max(2, int(height * scale) // 2 * 2)

    # Bajar bitrate solo si el archivo no entra en el limite final.
    for bitrate in (1_400_000, 900_000, 560_000):
        with av.open(filename, options={'protocol_whitelist': 'file,pipe'}) as source:
            input_stream = source.streams.video[0]
            source_fps = float(input_stream.average_rate or 30)
            with av.open(destination, mode='w', format='mp4', options={'movflags': '+faststart'}) as output:
                stream = output.add_stream('libx264', rate=24)
                stream.width = new_width
                stream.height = new_height
                stream.pix_fmt = 'yuv420p'
                stream.bit_rate = bitrate
                stream.options = {'preset': 'veryfast'}
                previous_pts = -1
                first_time = None
                decoded_frames = 0
                encoded_frames = 0
                for frame in source.decode(video=0):
                    decoded_frames += 1
                    current = (
                        float(frame.time)
                        if frame.time is not None
                        else (decoded_frames - 1) / source_fps
                    )
                    if first_time is None:
                        first_time = current
                    elapsed = current - first_time
                    if elapsed < 0 or elapsed > profile['seconds'] + .001:
                        raise ValueError('duration')
                    pts = max(0, round(elapsed * 24))
                    if pts <= previous_pts:
                        continue
                    previous_pts = pts
                    converted = frame.reformat(
                        width=new_width, height=new_height, format='yuv420p'
                    )
                    converted.pts = pts
                    converted.time_base = Fraction(1, 24)
                    for packet in stream.encode(converted):
                        output.mux(packet)
                    encoded_frames += 1
                if encoded_frames == 0:
                    raise ValueError('format')
                for packet in stream.encode():
                    output.mux(packet)
        # Re-validar archivo final; no se persiste nada si falla.
        if Path(destination).stat().st_size <= profile['bytes']:
            result = inspect_local_video(destination, profile['seconds'])
            if result['extension'] != 'mp4':
                raise ValueError('format')
            return result
    raise ValueError('size')


def process_video_upload(upload, kind='section'):
    from django.core.exceptions import ValidationError
    if kind not in VIDEO_PROFILES:
        raise ValidationError('Perfil de video desconocido.')
    profile = VIDEO_PROFILES[kind]
    if getattr(upload, 'size', 0) > MAX_INPUT_VIDEO_BYTES:
        raise ValidationError('El archivo original debe pesar hasta 20 MB.')
    upload.seek(0)
    data = upload.read(MAX_INPUT_VIDEO_BYTES + 1)
    if not data or len(data) > MAX_INPUT_VIDEO_BYTES:
        raise ValidationError('Selecciona un video valido de hasta 20 MB.')
    try:
        with TemporaryDirectory(prefix='openmind_video_') as folder:
            original = Path(folder) / 'video.upload'
            optimized = Path(folder) / 'optimized.mp4'
            original.write_bytes(data)
            command = [
                sys.executable, str(Path(__file__).resolve()),
                str(original), str(optimized), kind,
            ]
            result = subprocess.run(
                command, capture_output=True, text=True,
                timeout=55, check=False,
            )
            info = json.loads(result.stdout) if result.returncode == 0 else {}
            if not info.get('mime') or not optimized.is_file():
                error = info.get('error', 'format')
                if error == 'duration':
                    message = f'El video supera {profile["seconds"]} segundos.'
                elif error == 'size':
                    message = 'El video no se pudo reducir al tamano permitido.'
                else:
                    message = 'No pudimos procesar este MP4 o WebM. Revisa el archivo.'
                raise ValidationError(message)
            output_data = optimized.read_bytes()
            if not output_data or len(output_data) > profile['bytes']:
                raise ValidationError('El video comprimido supera el tamano permitido.')
            return VideoUpload(
                data=output_data, extension='mp4', mime='video/mp4',
                width=info['width'], height=info['height'],
            )
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as error:
        raise ValidationError(
            'No pudimos comprimir este video. Prueba uno mas corto o liviano.'
        ) from error


def _set_worker_limits():
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (40, 40))
        resource.setrlimit(resource.RLIMIT_AS, (1024**3, 1024**3))
    except ImportError:
        pass


if __name__ == '__main__':
    try:
        _set_worker_limits()
        if len(sys.argv) == 4:
            result = encode_local_video(sys.argv[1], sys.argv[2], sys.argv[3])
        elif len(sys.argv) == 2:
            result = inspect_local_video(sys.argv[1])
        else:
            raise ValueError('format')
        print(json.dumps(result))
    except Exception as error:
        known = ('format', 'duration', 'resolution', 'size')
        print(json.dumps({
            'error': str(error) if str(error) in known else 'format'
        }))
