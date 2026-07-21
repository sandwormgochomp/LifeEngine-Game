/* Dynamic reflection over arbitrary save/load payloads: both helpers walk
   whatever keys an object happens to have and filter on `typeof !== 'object'`,
   so there is no static shape to describe. Everything is Record<string, unknown>
   and call sites cast the result to the type they expect. */
const SerializeHelper = {
    copyNonObjects(obj: Record<string, unknown>): Record<string, unknown> {
        let newobj: Record<string, unknown> = {};
        for (let key in obj) {
            if (typeof obj[key] !== 'object')
                newobj[key] = obj[key];
        }
        return newobj;
    },
    overwriteNonObjects(copyFrom: Record<string, unknown>, copyTo: Record<string, unknown>): void {
        for (let key in copyFrom) {
            if (typeof copyFrom[key] !== 'object' && typeof copyTo[key] !== 'object') {
                // only overwrite if neither are objects
                copyTo[key] = copyFrom[key];
            }
        }
    }
}

export default SerializeHelper;
