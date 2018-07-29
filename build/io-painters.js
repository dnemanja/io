class ColorPickerPainter {
  static get inputProperties() { return ['--swatch-color']; }
  paint(ctx, geom, properties) {
    const w = geom.width, h = geom.height;
    const h_w = 24;
    const sv_w = w - h_w;

    const color = properties.get('--swatch-color');

    let gradient = ctx.createLinearGradient(0, 0, sv_w, 0);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, sv_w, h);

    gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, sv_w, h);

    gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0/6, '#ff0000');
    gradient.addColorStop(1/6, '#ff00ff');
    gradient.addColorStop(2/6, '#0000ff');
    gradient.addColorStop(3/6, '#00ffff');
    gradient.addColorStop(4/6, '#00ff00');
    gradient.addColorStop(5/6, '#ffff00');
    gradient.addColorStop(6/6, '#ff0000');
    ctx.fillStyle = gradient;
    ctx.fillRect(sv_w, 0, w, h);
  }
}

registerPaint('colorpicker', ColorPickerPainter);

class SliderPainter {
  static get inputProperties() { return ['--slider-min', '--slider-max', '--slider-step', '--slider-value']; }
  paint(ctx, geom, properties) {
    const min = parseFloat(properties.get('--slider-min'));
    const max = parseFloat(properties.get('--slider-max'));
    const step = parseFloat(properties.get('--slider-step'));
    const value = parseFloat(properties.get('--slider-value'));

    if (isNaN(value)) return;

    const w = geom.width, h = geom.height;
    const handleWidth = 4;

    let snap = Math.floor(min / step) * step;
    let pos;

    if (((max - min) / step) < w / 3 ) {
      while (snap < (max - step)) {
        snap += step;
        pos = Math.floor(w * (snap - min) / (max - min));
        ctx.lineWidth = .5;
        ctx.strokeStyle = "#888";
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, h);
        ctx.stroke();
      }
    }

    ctx.fillStyle = "#888";
    ctx.fillRect(0, h / 2 - 2, w, 4);

    pos = handleWidth / 2 + (w - handleWidth) * (value - min) / (max - min);
    const gradient = ctx.createLinearGradient(0, 0, pos, 0);
    gradient.addColorStop(0, '#2cf');
    gradient.addColorStop(1, '#2f6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, h / 2 - 2, pos, 4);

    ctx.lineWidth = handleWidth;
    ctx.strokeStyle = "#2f6";
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, h);
    ctx.stroke();
  }
}

registerPaint('slider', SliderPainter);

class SwatchPainter {
  static get inputProperties() { return ['--swatch-color']; }
  paint(ctx, geom, properties) {
    const w = geom.width, h = geom.height;
    const colors = ['#fff', '#ddd'];
    const size = h / 4;

    // TODO: optimize with image?!
    for (let y = 0; y < h/size; y++) {
      for(let x = 0; x < w/size; x++) {
        ctx.beginPath();
        ctx.fillStyle = colors[(x + y) % colors.length];
        ctx.rect(x * size, y * size, size, size);
        ctx.fill();
      }
    }

    ctx.fillStyle = properties.get('--swatch-color');
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.fill();
  }
}

registerPaint('swatch', SwatchPainter);

class UndersliderPainter {
  static get inputProperties() { return ['--slider-color', '--slider-value']; }
  paint(ctx, geom, properties) {
    const color = properties.get('--slider-color');
    const value = parseFloat(properties.get('--slider-value'));

    if (isNaN(value)) return;

    const w = geom.width, h = geom.height;
    const lineHeight = 1;
    const triangleSize = 3;

    ctx.lineWidth = lineHeight;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h - lineHeight / 2);
    ctx.lineTo(value * w, h - lineHeight / 2);
    ctx.stroke();

    if (value > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(value * w - triangleSize, h);
      ctx.lineTo(value * w, h - triangleSize);
      ctx.lineTo(value * w + triangleSize, h);
      ctx.fill();
    }
  }
}

registerPaint('underslider', UndersliderPainter);
