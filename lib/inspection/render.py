import json, subprocess, pathlib, textwrap, hashlib, shutil, os, math
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
ROOT=pathlib.Path(os.environ.get('INSPECTION_WORKSPACE','/workspace'));OUT=ROOT/'outputs';OUT.mkdir(exist_ok=True)
m=json.loads((ROOT/'approved.json').read_text());source=ROOT/'input'/'walkthrough';findings=m['findings']
if not findings or len(findings)>20 or any(f['decision']!='approved' for f in findings):raise ValueError('Only 1–20 inspector-approved findings may be rendered.')
expected=m['sourceSize']
if not source.exists() or source.stat().st_size!=expected:
    chunks=sorted((ROOT/'input').glob('part_*'));temporary=source.with_suffix('.assembling')
    if not chunks:raise ValueError('Source parts are missing.')
    with temporary.open('wb') as dest:
        for part in chunks:
            with part.open('rb') as src:shutil.copyfileobj(src,dest,4*1024*1024)
    if temporary.stat().st_size!=expected:raise ValueError('Reassembled source size does not match the upload.')
    temporary.replace(source)
    for part in chunks:part.unlink()
def run(args):
    result=subprocess.run(args,capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stderr[-5000:])
    return result.stdout
def probe(path):return json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)]))
source_info=probe(source);duration=float(source_info['format']['duration'])
if not 0<duration<=5400:raise ValueError('The source must be a valid video no longer than 90 minutes.')
source_video=next((v for v in source_info['streams'] if v['codec_type']=='video'),None)
if not source_video:raise ValueError('The source has no video stream.')
source_w=source_video['width'];source_h=source_video['height']
rotation=next((float(v.get('rotation',0)) for v in source_video.get('side_data_list',[]) if 'rotation' in v),float(source_video.get('tags',{}).get('rotate',0)))
if round(rotation)%180:source_w,source_h=source_h,source_w
fit=min(1280/source_w,536/source_h);content_w=source_w*fit;content_h=source_h*fit
if any(float(f['timestamp'])>=duration for f in findings):raise ValueError('A finding timestamp is outside the playable source video.')
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
pdfmetrics.registerFont(TTFont('Body',FONT));pdfmetrics.registerFont(TTFont('Strong',BOLD))
def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
def lines(draw,text,f,maxw):
    result=[];line=''
    for word in str(text).split():
        # Wrap unusually long tokens instead of clipping them off the canvas.
        pieces=[]
        while draw.textlength(word,font=f)>maxw:
            cut=max(1,int(len(word)*maxw/draw.textlength(word,font=f))-1);pieces.append(word[:cut]);word=word[cut:]
        pieces.append(word)
        for word in pieces:
            trial=(line+' '+word).strip()
            if draw.textlength(trial,font=f)>maxw and line:result.append(line);line=word
            else:line=trial
    if line:result.append(line)
    return result

def txt(draw,text,x,y,width,size=24,fill='#102638',bold=False,gap=8,maxlines=None):
    rows=lines(draw,text,font(size,bold),width)
    if maxlines and len(rows)>maxlines:rows=rows[:maxlines];rows[-1]=rows[-1].rstrip('. ')+'…'
    for row in rows:draw.text((x,y),row,font=font(size,bold),fill=fill);y+=size+gap
    return y

def stamp(t):return f'{int(t)//60:02}:{int(t)%60:02}'
chapters=[];frame_count=0;chapter_meta=[]
def encode_card(img,key,seconds):
    global frame_count
    image_path=ROOT/f'{key}.png';img.save(image_path);out=ROOT/f'{key}.mp4'
    run(['ffmpeg','-v','error','-y','-loop','1','-i',str(image_path),'-t',str(seconds),'-r','24','-c:v','libx264','-threads','2','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-an',str(out)]);frame_count+=1;return out

def voice_duration(key):
    p=ROOT/f'{key}.mp3'
    if not p.exists() or not p.stat().st_size:raise ValueError(f'Missing generated narration: {key}')
    result=probe(p)
    if not any(s['codec_type']=='audio' for s in result['streams']):raise ValueError('Narration has no audio stream.')
    return float(result['format']['duration'])

def chapter(key,parts):
    listing=ROOT/f'{key}_list.txt';listing.write_text('\n'.join(f"file '{p}'" for p in parts));out=ROOT/f'{key}_voiced.mp4'
    total=sum(float(probe(p)['format']['duration']) for p in parts)
    if total+0.2<voice_duration(key):raise ValueError('A chapter would cut off approved narration.')
    run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-i',str(ROOT/f'{key}.mp3'),'-map','0:v:0','-map','1:a:0','-af','apad','-t',str(total),'-c:v','copy','-c:a','aac','-ar','48000','-ac','2','-b:a','128k',str(out)])
    chapters.append(out);chapter_meta.append({'key':key,'duration':total,'narrationDuration':voice_duration(key)})

def aerial_opening():
    image_path=ROOT/'aerial.jpg'
    if hashlib.sha256(image_path.read_bytes()).hexdigest()!=m['aerial']['imageSha256']:raise ValueError('Aerial image does not match the approved preview.')
    image=Image.open(image_path).convert('RGB');out=ROOT/'aerial_opening.mp4';seconds=8
    process=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','24','-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','22','-pix_fmt','yuv420p',str(out)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        for frame in range(seconds*24):
            t=frame/(seconds*24-1);ease=t*t*(3-2*t);angle=-5+10*ease;scale=1.25+1.65*ease
            rotated=image.rotate(angle,resample=Image.Resampling.BICUBIC,expand=False)
            w=image.width/scale;h=w*720/1280;cx=image.width/2;cy=image.height/2
            view=rotated.crop((cx-w/2,cy-h/2,cx+w/2,cy+h/2)).resize((1280,720),Image.Resampling.LANCZOS)
            dr=ImageDraw.Draw(view);dr.rectangle((0,0,1280,99),fill='#102638');txt(dr,'PROPERTY LOCATION / HISTORICAL AERIAL',34,17,1210,17,'#55ddc4',True);txt(dr,m['address'],34,49,1210,26,'white',True,maxlines=1)
            dr.ellipse((625,345,655,375),fill='#087e6d',outline='white',width=4);dr.ellipse((613,333,667,387),outline='white',width=2)
            dr.rectangle((0,630,1280,720),fill='#102638');txt(dr,f"USGS / USDA NAIP · {m['aerial']['year']} · 2D overhead animation",34,646,1210,18,'white');txt(dr,'Data available from U.S. Geological Survey, National Geospatial Program.',34,679,1210,16,'#bed0df')
            process.stdin.write(view.tobytes())
        process.stdin.close();error=process.stderr.read().decode();code=process.wait()
        if code:raise RuntimeError(error[-3000:])
    except:
        process.kill();process.wait();raise
    return out
intro=Image.new('RGB',(1280,720),'#102638');d=ImageDraw.Draw(intro);d.rectangle((60,66,120,73),fill='#55ddc4');txt(d,'WALKTHROUGH / HOMEOWNER RECAP',60,105,1150,21,'#55ddc4',True);txt(d,m['address'],60,178,1150,43,'white',True,maxlines=4);txt(d,f"{m['date']} · {m['inspector'] or 'Inspector'}",60,447,1130,24,'#bed0df',maxlines=2);txt(d,f"{len(findings)} reviewed observations · Revision {m['revision']}",60,541,1150,25,'white');txt(d,'AI-generated narration · Inspector-approved script',60,633,1150,19,'#75dfc3')
opening=[aerial_opening()] if m.get('aerial') else []
opening.append(encode_card(intro,'intro_card',max(5,voice_duration('intro')+0.5-(8 if opening else 0))));chapter('intro',opening)
report_images=[]
for i,f in enumerate(findings):
    key=f'finding_{i}';voice_len=voice_duration(key);start=max(0,min(float(f['timestamp'])-2,duration-0.25));clip_len=max(.25,min(8,duration-start))
    overlay=Image.new('RGBA',(1280,720),(0,0,0,0));d=ImageDraw.Draw(overlay);d.rectangle((0,536,1280,720),fill=(10,28,42,242));txt(d,f"{i+1:02}  {f['title']}",38,552,1190,28,'white',True,maxlines=1);txt(d,f"{f['location']} / Source {stamp(f['timestamp'])}",38,597,1190,21,'#55ddc4',maxlines=1);txt(d,f['evidence'],38,636,1190,18,'#e4edf3',maxlines=2)
    if f.get('pointer'):
        x=int((1280-content_w)/2+f['pointer']['x']*content_w);y=int((536-content_h)/2+f['pointer']['y']*content_h);d.ellipse((x-28,y-28,x+28,y+28),outline='#ffce70',width=5)
    overlay_path=ROOT/f'overlay_{i}.png';overlay.save(overlay_path);clip=ROOT/f'clip_{i}.mp4'
    run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(source),'-i',str(overlay_path),'-filter_complex','[0:v]scale=1280:536:force_original_aspect_ratio=decrease,pad=1280:536:(ow-iw)/2:(oh-ih)/2:black,pad=1280:720:0:0:black[base];[base][1:v]overlay=0:0,setsar=1[v]','-map','[v]','-t',str(clip_len),'-r','24','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','23','-pix_fmt','yuv420p',str(clip)])
    still=ROOT/f'still_{i}.jpg';run(['ffmpeg','-v','error','-y','-ss',str(f['timestamp']),'-i',str(source),'-frames:v','1','-vf','scale=960:-2','-q:v','3',str(still)]);report_images.append(still)
    cards=[]
    for label,text in [('OBSERVATION',f['observation']),('VIDEO EVIDENCE',f['evidence']),('WHY IT MATTERS',f['whyItMatters']),('RECOMMENDED FOLLOW-UP',f['recommendation'])]:
        if not text.strip():continue
        dummy=ImageDraw.Draw(Image.new('RGB',(1280,720)));rows=lines(dummy,text,font(26),1156)
        for offset in range(0,len(rows),12):
            card=Image.new('RGB',(1280,720),'#f5f8fb');dr=ImageDraw.Draw(card);dr.rectangle((0,0,14,720),fill='#14a88e');txt(dr,f"{i+1:02} / {f['severity'].upper()}",60,43,1160,18,'#168873',True);txt(dr,f['title'],60,85,1160,31,bold=True,maxlines=2);txt(dr,label,60,182,1160,18,'#507087',True)
            for line_no,line in enumerate(rows[offset:offset+12]):dr.text((60,228+line_no*32),line,font=font(26),fill='#102638')
            txt(dr,f"Source {stamp(f['timestamp'])} · Inspector-reviewed · AI-generated narration",60,670,1160,16,'#507087');cards.append((card,len(' '.join(rows[offset:offset+12]))))
    if f.get('diagram'):
        card=Image.new('RGB',(1280,720),'#102638');dr=ImageDraw.Draw(card);txt(dr,'HOW THIS MAY AFFECT THE HOME',60,68,1160,24,'#55ddc4',True);txt(dr,f['title'],60,122,1160,32,'white',True,maxlines=2)
        for j,(label,value) in enumerate([('OBSERVATION',f['diagram']['cause']),('POSSIBLE EFFECT',f['diagram']['effect']),('NEXT STEP',f['diagram']['action'])]):
            x=60+j*405;dr.rounded_rectangle((x,260,x+350,540),radius=18,fill='#1e3d52');txt(dr,label,x+24,286,302,17,'#55ddc4',True);txt(dr,value,x+24,337,302,23,'white',maxlines=6)
            if j<2:dr.line((x+356,399,x+398,399),fill='#55ddc4',width=3);dr.polygon([(x+398,399),(x+389,392),(x+389,406)],fill='#55ddc4')
        txt(dr,'Inspector-approved conceptual explanation; not a diagnostic image.',60,631,1160,19,'#bed0df');cards.append((card,230))
    remaining=max(len(cards)*5,voice_len+0.5-clip_len);weight=sum(n for _,n in cards) or 1;parts=[clip]
    for j,(card,n) in enumerate(cards):parts.append(encode_card(card,f'{key}_card_{j}',max(5,remaining*n/weight)))
    chapter(key,parts)
outro=Image.new('RGB',(1280,720),'#102638');d=ImageDraw.Draw(outro);txt(d,'A clearer next step.',65,145,1150,49,'white',True);txt(d,'Use the accompanying written report for the same observations, evidence times, and recommended follow-up.',65,260,1130,28,'#bed0df');txt(d,'Selected video evidence does not establish a complete inspection or a certified diagnosis.',65,428,1110,25,'#bed0df');txt(d,'AI-generated narration · Inspector-approved script',65,632,1140,20,'#55ddc4');chapter('outro',[encode_card(outro,'outro_card',max(6,voice_duration('outro')+0.5))])
listing=ROOT/'chapters.txt';listing.write_text('\n'.join(f"file '{p}'" for p in chapters));run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(OUT/'homeowner-recap.mp4')])

# PDF uses the same exact approved observations and conceptual explanations.
report=canvas.Canvas(str(OUT/'inspection-report.pdf'),pagesize=(612,792));page=1;y=648
report.setTitle(f"Inspection report · {m['address']}");report.setAuthor(m['inspector'] or 'Inspector')
def header():
    report.setFillColor(HexColor('#102638'));report.rect(0,682,612,110,fill=1,stroke=0);report.setFillColor(HexColor('#55ddc4'));report.setFont('Strong',9);report.drawString(44,756,'WALKTHROUGH / INSPECTION REPORT');report.setFillColor(HexColor('#ffffff'));report.setFont('Strong',17);report.drawString(44,723,m['address'][:57]);report.setFont('Body',9);report.drawString(44,698,f"{m['date']} | {m['inspector'][:45] or 'Inspector'} | Revision {m['revision']}");report.setFillColor(HexColor('#506879'));report.setFont('Body',8);report.drawString(44,28,f"Selected evidence; not an exhaustive inspection. | {page}")
def newpage():
    global page,y
    report.showPage();page+=1;header();y=648

def pdf_lines(text,width=524):
    result=[];line=''
    for word in str(text).split():
        pieces=[]
        while pdfmetrics.stringWidth(word,'Body',10.5)>width:
            cut=max(1,int(len(word)*width/pdfmetrics.stringWidth(word,'Body',10.5))-1);pieces.append(word[:cut]);word=word[cut:]
        pieces.append(word)
        for piece in pieces:
            trial=(line+' '+piece).strip()
            if line and pdfmetrics.stringWidth(trial,'Body',10.5)>width:result.append(line);line=piece
            else:line=trial
    if line:result.append(line)
    return result

def paragraph(text,label=None):
    global y
    rows=[]
    if label:rows.append((label,True))
    rows.extend((line,False) for line in pdf_lines(text))
    for line,bold in rows:
        if y<70:newpage()
        report.setFillColor(HexColor('#102638'));report.setFont('Strong' if bold else 'Body',10.5);report.drawString(44,y,line);y-=16
    y-=12
header();paragraph(m['address'],'PROPERTY');paragraph(f"{len(findings)} inspector-approved observations. The narrated video and report share approved revision {m['revision']}. The recap uses AI-generated narration from the inspector-reviewed script; original audio is omitted.");paragraph(m.get('coverage') or 'Manually documented observations. Automated source coverage has not been established for this inspection.','REVIEW SCOPE')
if m.get('aerial'):
    newpage();paragraph('Confirmed property location','HISTORICAL AERIAL CONTEXT');paragraph(m['aerial']['matchedAddress']);report.drawImage(str(ROOT/'aerial.jpg'),44,y-360,width=524,height=360,preserveAspectRatio=True,anchor='c');y-=382;paragraph(f"USGS / USDA NAIP · Acquisition year {m['aerial']['year']}. {m['aerial']['attribution']}");paragraph('The inspector confirmed the property location. The video opens with a two-dimensional zoom and overhead rotation of this historical image. It is location context, not current inspection evidence or a three-dimensional orbit.')
for i,f in enumerate(findings):
    newpage();paragraph(f"{i+1:02}. {f['title']}",f['severity'].upper());paragraph(f"{f['location']} | Source {stamp(f['timestamp'])}–{stamp(f['endTimestamp'])}")
    if y<360:newpage()
    report.drawImage(str(report_images[i]),44,y-210,width=524,height=210,preserveAspectRatio=True,anchor='c');y-=230
    paragraph(f['observation'],'OBSERVATION');paragraph(f['evidence'],'VIDEO EVIDENCE');paragraph(f['whyItMatters'],'WHY IT MATTERS');paragraph(f['recommendation'],'RECOMMENDED FOLLOW-UP')
    if f.get('diagram'):paragraph(f"{f['diagram']['cause']} → {f['diagram']['effect']} → {f['diagram']['action']}",'CONCEPTUAL EXPLANATION')
paragraph('Only visible and described conditions within reviewed footage are represented. Concealed areas, measurements, code compliance, and systems requiring in-person testing have not been established. Tentative causes require verification. This document does not certify a diagnosis.','LIMITATIONS');report.save()
(OUT/'approved-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));final=probe(OUT/'homeowner-recap.mp4');has_audio=any(s['codec_type']=='audio' for s in final['streams'])
if not has_audio:raise ValueError('Final recap is missing narration.')
result={'revision':m['revision'],'findingIds':[f['id'] for f in findings],'manifestSha256':hashlib.sha256((ROOT/'approved.json').read_bytes()).hexdigest(),'videoDuration':float(final['format']['duration']),'hasAudio':has_audio,'chapters':chapter_meta,'outputs':[{'name':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [OUT/'homeowner-recap.mp4',OUT/'inspection-report.pdf',OUT/'approved-manifest.json']]}
(OUT/'export-check.json').write_text(json.dumps(result));print(json.dumps(result))
