import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const external = [
    'react',
    'react-native',
    'expo-location'
];

export default [
    {
        input: 'src/index.tsx',
        output: [
        {
            file: 'lib/index.js',
            format: 'cjs',
            exports: 'named',
            sourcemap: true
        },
        {
            file: 'lib/index.esm.js',
            format: 'esm',
            sourcemap: true
        }
        ],
        external,
        plugins: [
        typescript({
            tsconfig: './tsconfig.json',
            declaration: false,
            declarationMap: false
        })
        ]
    },
    {
        input: 'src/index.tsx',
        output: {
            file: 'lib/index.d.ts',
            format: 'esm'
        },
        external,
        plugins: [dts()]
    }
];