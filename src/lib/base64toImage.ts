import * as fs from 'fs';

export default function base64toImage(
    base64String: string,
    fileName?: string,
    mimeType?: string
) {
    return new Promise((resolve) => {
        const binaryString = Buffer.from(base64String, 'base64');

        const blob = new Blob([binaryString], {type: mimeType || 'image/png'});

        const file = new File([blob], fileName || 'image', {type: mimeType || 'image/png'});

        resolve(file);
    })
}