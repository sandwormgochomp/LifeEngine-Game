/* A unit gradient vector stored per lattice point. */
export interface Vector2 {
    x: number;
    y: number;
}

export interface PerlinNoise {
    /* Both caches are keyed by the "x,y" string built by key(). They are
       (re)created by seed(), which runs once at module load below and again
       whenever a caller wants fresh noise. The literal starts them empty so
       they are non-optional for the type checker; seed() overwrites both
       before anything can read them, so this is unobservable. */
    gradients: Record<string, Vector2>;
    memory: Record<string, number>;
    rand_vect(): Vector2;
    key(x: number, y: number): string;
    dot_prod_grid(x: number, y: number, vx: number, vy: number): number;
    smootherstep(x: number): number;
    interp(x: number, a: number, b: number): number;
    seed(): void;
    get(x: number, y: number): number;
}

let perlin: PerlinNoise = {
    gradients: {},
    memory: {},
    rand_vect: function(): Vector2 {
        let theta = Math.random() * 2 * Math.PI;
        return {x: Math.cos(theta), y: Math.sin(theta)};
    },
    // Both caches are keyed by coordinate pair. These used to be indexed with a
    // bare array -- this.gradients[[vx,vy]] -- which worked only because JS
    // stringifies the key, turning [1,2] into "1,2". Spelled out as a template
    // so the coercion is visible; the key strings are byte-identical to before.
    key: function(x: number, y: number): string {
        return `${x},${y}`;
    },
    dot_prod_grid: function(x: number, y: number, vx: number, vy: number): number{
        let g_vect: Vector2;
        let d_vect = {x: x - vx, y: y - vy};
        let k = this.key(vx, vy);
        if (this.gradients[k]){
            g_vect = this.gradients[k];
        } else {
            g_vect = this.rand_vect();
            this.gradients[k] = g_vect;
        }
        return d_vect.x * g_vect.x + d_vect.y * g_vect.y;
    },
    smootherstep: function(x: number): number{
        return 6*x**5 - 15*x**4 + 10*x**3;
    },
    interp: function(x: number, a: number, b: number): number{
        return a + this.smootherstep(x) * (b-a);
    },
    seed: function(): void{
        this.gradients = {};
        this.memory = {};
    },
    get: function(x: number, y: number): number {
        let k = this.key(x, y);
        if (Object.prototype.hasOwnProperty.call(this.memory, k))
            return this.memory[k];
        let xf = Math.floor(x);
        let yf = Math.floor(y);
        //interpolate
        let tl = this.dot_prod_grid(x, y, xf,   yf);
        let tr = this.dot_prod_grid(x, y, xf+1, yf);
        let bl = this.dot_prod_grid(x, y, xf,   yf+1);
        let br = this.dot_prod_grid(x, y, xf+1, yf+1);
        let xt = this.interp(x-xf, tl, tr);
        let xb = this.interp(x-xf, bl, br);
        let v = this.interp(y-yf, xt, xb);
        this.memory[k] = v;
        return v;
    }
}
perlin.seed();

export default perlin;
