import json, subprocess, pathlib, math, sys, shutil, os
from PIL import Image, ImageDraw, ImageFont
ROOT=pathlib.Path(os.environ.get('INSPECTION_WORKSPACE','/workspace')); OUT=ROOT/'outputs'; OUT.mkdir(exist_ok=True)
source=ROOT/'input'/'walkthrough'
expected=int(sys.argv[1])
if not source.exists() or source.stat().st_size!=expected:
    chunks=sorted((ROOT/'input').glob('part_*'));temporary=source.with_suffix('.assembling')
    if not chunks: raise ValueError('Source parts are missing.')
    with temporary.open('wb') as dest:
        for part in chunks:
            with part.open('rb') as src: shutil.copyfileobj(src,dest,4*1024*1024)
    if temporary.stat().st_size!=expected: raise ValueError('Reassembled source size does not match the upload.')
    temporary.replace(source)
    for part in chunks: part.unlink()
def run(args):
    result=subprocess.run(args,capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stderr[-5000:])
    return result.stdout
meta=json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(source)]))
video=next((s for s in meta['streams'] if s['codec_type']=='video'),None)
if not video: raise ValueError('The uploaded file does not contain a readable video stream.')
duration=float(meta['format'].get('duration') or video.get('duration') or 0)
if not 0<duration<=5400: raise ValueError('Video must be between 1 second and 90 minutes long.')
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
try: font=ImageFont.truetype(font_path,18)
except: font=ImageFont.load_default()
frames=[]; sheets=[]; step=max(10,math.ceil(duration/120))
for i,t in enumerate(range(0,math.ceil(duration),step)):
    path=ROOT/f'frame_{i:04}.jpg'
    run(['ffmpeg','-v','error','-y','-ss',str(min(t,max(0,duration-0.1))),'-i',str(source),'-frames:v','1','-vf','scale=384:216:force_original_aspect_ratio=decrease,pad=384:216:(ow-iw)/2:(oh-ih)/2','-q:v','4',str(path)])
    frames.append((t,path))
for k in range(0,len(frames),12):
    page=Image.new('RGB',(1152,976),'#102638'); draw=ImageDraw.Draw(page)
    for j,(t,path) in enumerate(frames[k:k+12]):
        x=(j%3)*384;y=(j//3)*244
        page.paste(Image.open(path),(x,y));draw.text((x+10,y+221),f'Source {int(t)//60:02}:{int(t)%60:02}',font=font,fill='white')
    name=f'evidence_{k//12+1:02}.jpg';page.save(OUT/name,quality=70,optimize=True);sheets.append(name)
has_audio=any(s['codec_type']=='audio' for s in meta['streams'])
audio_files=[]
if has_audio:
    run(['ffmpeg','-v','error','-y','-i',str(source),'-vn','-ac','1','-ar','16000','-c:a','libmp3lame','-b:a','48k','-f','segment','-segment_time','1800','-reset_timestamps','1',str(OUT/'narration_%02d.mp3')])
    audio_files=[{'name':p.name,'offset':i*1800} for i,p in enumerate(sorted(OUT.glob('narration_*.mp3')))]
result={'duration':duration,'width':video['width'],'height':video['height'],'hasAudio':has_audio,'sampleInterval':step,'frameCount':len(frames),'sheets':sheets,'audioFiles':audio_files,'ffmpeg':run(['ffmpeg','-version']).splitlines()[0]}
(OUT/'prepare.json').write_text(json.dumps(result))
print(json.dumps(result))
